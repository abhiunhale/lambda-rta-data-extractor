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
var AWS = require('aws-sdk');
var commonUtils = require('lambda-common-utils');
let constantUtils = require("../ConstantUtils");
const sinon = require("sinon");
const secretsManagerStub = require("../helpers/SecretsManagerHelper");
const constants = constantUtils.getConstants;
let secretAndAccessKeysStub;


describe('lambda wfm snowflake data export IT', function () {
    this.timeout(300000);

    var lambdaEvent;
    var evolveAuth;

    before(async function () {
        if (!process.env.AWS_PROFILE) {
            process.env.AWS_PROFILE = 'dev';
        }
        if (!process.env.DATALAKE_BUCKET) {
            process.env.DATALAKE_BUCKET = 'dev-datalake-cluster-bucket-q37evqefmksl';
        }
        if (!process.env.SERVICE_URL) {
            process.env.SERVICE_URL = 'https://na1.dev.nice-incontact.com';
        }
        if(!process.env.WFM_SNOWFLAKE_USER_SECRET) {
            process.env.WFM_SNOWFLAKE_USER_SECRET = 'dev-wfm-snowflake-user-secret';
        }
        if (!process.env.AWS_REGION) {
            try {
                process.env.AWS_REGION = 'us-west-2';
                AWS.config.update({region: 'us-west-2'});
            } catch (ex) {
                assert.fail("Error at setting a AWS region.");
            }
        }
        if (process.env.LOCAL_IT && process.env.LOCAL_IT == 'true') {
            // when running IT locally & using aws-role-creds.ps1 script to auto-generate ./aws/credentials file
            // then {profile: 'default'} must be used.
            console.info("LOCAL_IT env var was found setting up credentials for LOCAL development machine IT execution using SharedIniFileCredentials");
            AWS.config.credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
        }
        let sfConn = { account:'cxone_na1_dev', username: 'WFM_DATA_EXTRACT_MS', password: 'gICW#U48xm46JJzA'};
        let secretsManagerStub = require('../helpers/SecretsManagerHelper');
        secretAndAccessKeysStub = sinon.stub(secretsManagerStub, 'getSecrets').returns(sfConn);
        process.env.TR_LAMBDA_NAME = `${process.env.AWS_PROFILE}-Token-Retriever-Lambda`;
        try {
            evolveAuth = await commonUtils.lambdaApis.authorizeToEvolve();
            console.log(JSON.stringify(evolveAuth));
        } catch (err) {
            console.error("authorizeToEvolve() failed. error:" + JSON.stringify(err));
            throw err;
        }
    });

    beforeEach(function () {
        lambdaEvent = JSON.parse(JSON.stringify(require('../test/mocks/mockEvent.json')));
        lambdaEvent.headers.Authorization = "Bearer " + evolveAuth.token;
    });

    it('Run  lambda successfully', function () {
        return LambdaTester(myHandler)
            .event(lambdaEvent)
            .expectResult(function (result) {
                console.log(JSON.stringify(result));
                expect(result).to.exist;
            });
    });


    it('Failure run for lambda with invalid token', function () {
        lambdaEvent.headers.Authorization = "";
        return LambdaTester(myHandler)
            .event(lambdaEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.BAD_REQUEST);
            })
    });
});