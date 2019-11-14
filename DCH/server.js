"use strict";

const express = require("express")();
const basicAuth = require("express-basic-auth");
const soap = require("soap");
const path = require("path");
const xmlconvert = require("xml-js");
const fs = require("fs");
const debug = require("debug")("anl:flexag:server");
const uuidv4 = require("uuid/v4");
const port = 8868;
const soapPath = "/wsdl";

const mqtt = require("mqtt");

////////////////////////////////////////////////////

let wsdljs;
let wsdlservice;
let wsdlport;
let wsdlops;

let dchService = {};

let soapServer;

const configpath = path.join(__dirname, "..", "secrets.config");

const config = JSON.parse(fs.readFileSync(configpath, "utf8"));

let wsdlpath = path.join(
  __dirname,
  "../wsdl",
  "ChargePointOperatorService.wsdl"
);

let mqtt_client = mqtt.connect(config.mqtt.url, {
  username: config.mqtt.username,
  password: config.mqtt.password
});

mqtt_client.on("connect", () => debug("mqtt connected...."));

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
// let users = { innogy: config.soap.auth.password };

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
  // soapServer.on("headers", function(headers, methodName) {
  //   console.log(methodName);
  //   console.log(headers);
  // });

  // soapServer.on("request", function(req, methodName) {
  //   debug(methodName);
  //   debug(req);
  // });

  // soapServer.authenticate = function(security) {
  //   var created, nonce, password, user, token;
  //   debug(`User: ${security}`);
  //   return false;
  // };
  // soapServer.log = function(type, data) {
  //   debug(`${type}: ${data}`);
  // };
});

express.get("/", function(req, res) {
  res.send("Hello");
});

// define the default ocpp soap function for the server
let dchFunc = function(command, args, cb, headers) {
  debug(`Made it to the dch Func call: ${command}`);
  mqtt_client.publish(`test/flexAg/req/${command}`, JSON.stringify(args));
  return;
  // create a unique id for each message to identify responses
  let id = uuidv4();

  // Set a timout for each event response so they do not pile up if not responded to
  let to = setTimeout(
    function(id) {
      // node.log("kill:" + id);
      if (ee.listenerCount(id) > 0) {
        let evList = ee.listeners(id);
        ee.removeListener(id, evList[0]);
      }
    },
    120 * 1000,
    id
  );

  // This makes the response async so that we pass the responsibility onto the response node
  ee.once(id, function(returnMsg) {
    clearTimeout(to);
    cb(returnMsg);
  });

  // Add custom headers to the soap package

  // let soapSvr = ocppVer == '1.5' ? soapServer15 : soapServer16;

  // addHeaders(headers, soapSvr);

  // let cbi =
  //   headers.chargeBoxIdentity.$value ||
  //   headers.chargeBoxIdentity ||
  //   'Unknown';
  let action = command;
  console.log(command);

  // node.status({ fill: 'green', shape: 'ring', text: cbi + ': ' + action });
  // // Send the message out to the rest of the flow
  // sendMsg(ocppVer, command, id, args, headers);
};
