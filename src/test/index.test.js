'use strict';

let expect = require('chai').expect;
let rewire = require("rewire");
let LambdaTester = require('lambda-tester');
let mainModule = rewire('../index.js');
let myHandler = mainModule.handler;
let Executor = mainModule.Executor;
let moment = require('moment');
let request = require('request');
let AWSMock = require('aws-sdk-mock');
let sinon = require("sinon");
let executor;
let performGetRequestToCXoneStub;
let LambdaUtils = require('../LambdaUtils.js');
let token = "token";
let schemaName = "mock_tenant";
let host = "http://locallink";

describe('Describe your AWS Lambda functionality here', function () {


    beforeEach(function () {

    });

    afterEach(function () {

    });

});
