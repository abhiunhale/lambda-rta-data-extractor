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
};