"use strict";

const express = require("express")();
const basicAuth = require("express-basic-auth");
const soap = require("soap");
const path = require("path");
const xmlconvert = require("xml-js");
const fs = require("fs");

const port = 8868;
const soapPath = "/wsdl";

////////////////////////////////////////////////////

let wsdljs;
let wsdlservice;
let wsdlport;
let wsdlops;

let dchService = {};

let soapServer;

let wsdlpath = path.join(
  __dirname,
  "../wsdl",
  "ChargePointOperatorService.wsdl"
);

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
  console.log(op._attributes.name);

  dchService[wsdlservice][wsdlport][op._attributes.name] = function() {
    dchFunc(op._attributes.name, args, cb, headers);
  };
}, this);

////////////////////////////////////////////////////

express.use(
  basicAuth({
    users: {
      innogy: "innogy15118"
    }
  })
);

express.listen(port, function() {
  soapServer = soap.listen(express, {
    path: "/wsdl",
    services: dchService,
    xml: wsdlxml
  });
});

express.get("/", function(req, res) {
  res.send("Hello");
});

// define the default ocpp soap function for the server
let dchFunc = function(command, args, cb, headers) {
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
