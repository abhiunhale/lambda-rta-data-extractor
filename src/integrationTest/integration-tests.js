/*
 * IN ORDER TO RUN IT LOCALLY DO:
 * 1. Add Environment variables:
 * lOCAL_IT=true
 * HOST=https://na1.dev.nice-incontact.com
 * !!!!! MAKE SURE !!!! YOU DON"T HAVE THIS VAR: AWS_PROFILE=dev - from some reason it disrupt the "commonUtils.lambdaApis.authorizeToEvolve()" call.
 * 2. Execute (in powerShell) aws-role-creds.ps1 script to auto-generate ./aws/credentials file
 * see: https://tlvconfluence01.nice.com/display/WFM/AWS+SDK+Usage+with+Assumed+Roles+and+MFA
 */
var expect = require('chai').expect;
var assert = require('assert');
var mainModule = require('../index.js');
var LambdaTester = require('lambda-tester');
var myHandler = mainModule.handler;
var Executor = mainModule.Executor;
var sinon = require("sinon");
var AWS = require('aws-sdk');
var commonUtils = require('lambda-common-utils');
var clone = require('clone');

var helper;

describe('lambda-wfm-snowflake-data-export IT', function () {

    before(async function() {

    });

    beforeEach(function () {

    });
});