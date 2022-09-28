'use strict';

let request = require('request');
let AWS = require('aws-sdk');
let moment = require('moment');
let Promise = require("bluebird");
Promise.allSettled = require("promise.allsettled");
let sizeof = require('object-sizeof');
let LambdaUtils = require('./LambdaUtils.js');
let commonUtils = require('lambda-common-utils');

function Executor(event, context) {
    console.log("in the lambda executor");
}

exports.Executor = Executor;

/**
 * Your AWS Lambda description goes here
 */
exports.handler = (event, context) => {
    console.log("in the lambda handler function");

    let responseBody = {
        message: "hello world"
    };

    // The output from a Lambda proxy integration must be
    // in the following JSON object. The 'headers' property
    // is for custom response headers in addition to standard
    // ones. The 'body' property  must be a JSON string. For
    // base64-encoded payload, you must also set the 'isBase64Encoded'
    // property to 'true'.
    let response = {
        statusCode: 200,
        headers: {
            "x-custom-header" : "my custom header value"
        },
        body: JSON.stringify(responseBody)
    };
    console.log("response: " + JSON.stringify(response));
    return response;
};