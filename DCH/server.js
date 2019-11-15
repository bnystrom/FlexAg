"use strict";

const express = require("express")();
const basicAuth = require("express-basic-auth");
const soap = require("soap");
const path = require("path");
const xmlconvert = require("xml-js");
const fs = require("fs");
const debug = require("debug")("anl:flexag:server");
//const uuidv4 = require("uuid/v4");
const mqtt = require("mqtt");
const events = require("events");

const port = 8868;
const soapPath = "/wsdl";
const EventEmitter = events.EventEmitter;

let ee = new EventEmitter();

////////////////////////////////////////////////////

let wsdljs;
let wsdlservice;
let wsdlport;
let wsdlops;

let dchService = {};

let soapServer;

const configpath = path.join(__dirname, "..", "secrets.config");

const config = JSON.parse(fs.readFileSync(configpath, "utf8"));

const mqttTopic = config.mqtt.topicHead;

let wsdlpath = path.join(
  __dirname,
  "../wsdl",
  "ChargePointOperatorService.wsdl"
);

let mqtt_client = mqtt.connect(config.mqtt.url, {
  username: config.mqtt.auth.username,
  password: config.mqtt.auth.password
});

mqtt_client.on("connect", () => debug("mqtt connected...."));

mqtt_client.subscribe(`${mqttTopic}/res/#`, function(err) {
  if (err) console.error(`MQTT Error: ${err}`);
});

mqtt_client.on("message", function(topic, res) {
  debug(`Got MQTT response: [${topic}] ${res}`);
  let x = JSON.parse(res);
  let eeID = x.RequestID;
  ee.emit(eeID, x);
});

const wsdlxml = fs.readFileSync(wsdlpath, "utf8");

wsdljs = xmlconvert.xml2js(wsdlxml, { compact: true, spaces: 4 });

// console.log(JSON.stringify(wsdljs));
// console.log(wsdljs.definitions);

wsdlservice = wsdljs["definitions"]["service"]._attributes.name;
wsdlport = wsdljs["definitions"]["service"]["port"]._attributes.name;
dchService[wsdlservice] = {};
dchService[wsdlservice][wsdlport] = {};

wsdlops = wsdljs["definitions"]["portType"]["operation"];

wsdlops.forEach(function(op) {
  // console.log(op._attributes.name);

  dchService[wsdlservice][wsdlport][op._attributes.name] = function(
    args,
    cb,
    headers
  ) {
    dchFunc(op._attributes.name, args, cb, headers);
  };
}, this);

////////////////////////////////////////////////////

let users = { [config.soap.auth.username]: config.soap.auth.password };

let useAuth = false;

if (config.soap.hasOwnProperty("useAuth")) {
  useAuth = config.soap.useAuth;
}

debug(useAuth);

if (useAuth) {
  if (
    config.soap.hasOwnProperty("auth") &&
    config.soap.auth.hasOwnProperty("username") &&
    config.soap.auth.hasOwnProperty("password")
  ) {
    debug("using auth for soap");
    express.use(basicAuth({ users }));
  }
}

express.listen(port, function() {
  debug("in listen");

  soapServer = soap.listen(express, "/wsdl", dchService, wsdlxml, () =>
    debug("SOAP server initialized...")
  );

  soapServer.on("headers", function(headers, methodName) {
    console.log(methodName);
    console.log(headers);
  });

  // soapServer.on("request", function(req, methodName) {
  //   debug(methodName);
  //   debug(req);
  // });

  // soapServer.log = function(type, data) {
  //   debug(`${type}: ${data}`);
  // };
});

express.get("/", function(req, res) {
  res.send("<h2>Hello from ANL Flex Aggregator</h2>");
});

// define the default ocpp soap function for the server
let dchFunc = function(command, soapbody, cb, headers) {
  debug(`Made it to the dch Func call: ${command}`);

  let eeID;

  if (soapbody.hasOwnProperty("RequestID")) {
    eeID = soapbody.RequestID;
    debug(`eeID = ${eeID}`);
  } else {
    console.error("Invalid request. Missing RequestID");
    return;
  }

  // Set a timout for each event response so they do not pile up if not responded to
  let to = setTimeout(
    function(eeID) {
      // node.log("kill:" + id);
      if (ee.listenerCount(eeID) > 0) {
        let evList = ee.listeners(eeID);
        ee.removeListener(eeID, evList[0]);
      }
    },
    120 * 1000,
    eeID
  );

  ee.once(eeID, function(returnMsg) {
    clearTimeout(to);
    cb(returnMsg);
  });

  mqtt_client.publish(`${mqttTopic}/req/${command}`, JSON.stringify(soapbody));
};
