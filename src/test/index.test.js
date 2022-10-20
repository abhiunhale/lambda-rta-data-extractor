'use strict';

let expect = require('chai').expect;
let rewire = require("rewire");
let sinon = require("sinon");
let LambdaTester = require('lambda-tester');
let LambdaUtils = require('../LambdaUtils.js');
let mainModule = rewire('../index.js');
let AWSMock = require('aws-sdk-mock');
let constantUtils = require("../ConstantUtils");
const constants = constantUtils.getConstants;
let Handler = mainModule.handler;
let Executor = mainModule.Executor;
let executor;
var mockEvent, performGetRequestToCXoneStub, mockAPIResponse;

describe('WFM RTA export report test', function () {
    this.timeout(30000);
    var getMockEvent = function (eventData) {
        return JSON.parse(eventData);
    };

    beforeEach(function () {
        mockEvent = getMockEvent(JSON.stringify(require('./mocks/mockEvent.json')));
        mockAPIResponse = getMockEvent(JSON.stringify(require('./mocks/mockAPIResult.json')));
        process.env.DATALAKE_BUCKET = "sample-dl-bucket";
        process.env.SERVICE_URL = "https://na1.dev.nice-incontact.com";
        process.env.DEBUG = true;
        performGetRequestToCXoneStub = sinon.stub(LambdaUtils, 'performGetRequestToCXone');
        AWSMock.mock('S3', 'upload', (params, callback) => {
            let data = {"Location": "ABC"};
            callback(null, data);
        });
        AWSMock.mock('S3', 'getSignedUrl', (operation, params, callback) => {
            let data = "https://abc.csv";
            callback(null, data);
        });
        let token = mockEvent.headers.Authorization.split(" ")[1];
        executor = new Executor(mockEvent.body, token);
    });

    afterEach(function(){
        performGetRequestToCXoneStub.restore();
        AWSMock.restore();
    });

    it("Report export Done with status = 200", done => {
        let response = mockAPIResponse;
        response.users = [];
        performGetRequestToCXoneStub.resolves(JSON.stringify(response));
        LambdaTester(Handler)
            .event(mockEvent)
            .expectResult((result) => {
                result.url.promise().then((res) => {
                    expect(res).to.exist;
                    expect(res).to.equal("https://abc.csv");
                    done();
                });
            })
            .catch(done);
    });

    it("Verify success of executor authenticate request method", async () => {
        performGetRequestToCXoneStub.resolves(JSON.stringify(mockAPIResponse));
        await executor.authenticateRequest();
    });

    it("Verify handler failure while request authentication", done => {
        performGetRequestToCXoneStub.rejects(constants.INVALID_TOKEN);
        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(result => {
                expect(result.message).to.exist;
                expect(result.message).to.equal(constants.INTERNAL_ERROR);
                done();
            })
            .catch(done);
    });

    it("Verify failure in executor authenticate request method", done => {
        let errorMsg = {err: constants.INVALID_TOKEN};
        performGetRequestToCXoneStub.rejects(errorMsg);
        executor.authenticateRequest().catch(error => {
            expect(error.message).to.equal(JSON.stringify(errorMsg));
            done();
        });
    });

    it("Verify executor method has license returns true", async() => {
        performGetRequestToCXoneStub.resolves(JSON.stringify(mockAPIResponse));
        await executor.authenticateRequest();
        let hasLicense = executor.verifyWFMLicense();
        expect(hasLicense).to.equal(true);
    });

    it("Verify executor method returns false when WFM license is not present", async() => {
        let tenant = { "tenant" : {
                "licenses" : [ {
                    "applicationId" : "PLATFORMSERVICES",
                    "productId" : "EVOLVE",
                    "featureIds": [141, 62, 111],
                    "settings": {}
                }]
            }
        };
        performGetRequestToCXoneStub.resolves(JSON.stringify(tenant));
        await executor.authenticateRequest();
        let hasLicense = executor.verifyWFMLicense();
        expect(hasLicense).to.equal(false);
    });

    it("Verify executor method returns false when licenses are not present", async () => {
        let tenant = {"tenant": {"licenses": []}};
        performGetRequestToCXoneStub.resolves(JSON.stringify(tenant));
        await executor.authenticateRequest();
        let hasLicense = executor.verifyWFMLicense();
        expect(hasLicense).to.equal(false);
    });

    it("Verify error in handler when license verification fails", done => {
        let token = mockEvent.headers.Authorization.split(" ")[1];
        let tenant = {"tenant": {"licenses": []}};
        performGetRequestToCXoneStub.withArgs(constants.CURRENT_API, token, process.env.SERVICE_URL, false)
            .onCall(0).returns(Promise.resolve(JSON.stringify(tenant)));

        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.INTERNAL_ERROR);
                done();
            })
            .catch(done);
    });

    it("Verify error if the feature toggle is off", done => {
        let featurePath = constants.CHECK_FT_STATUS_API + constants.EXPORT_FT;
        let token = mockEvent.headers.Authorization.split(" ")[1];
        performGetRequestToCXoneStub.withArgs(constants.CURRENT_API, token, process.env.SERVICE_URL, false)
            .onCall(0).returns(Promise.resolve(JSON.stringify(mockAPIResponse)));
        performGetRequestToCXoneStub.withArgs(featurePath, token, process.env.SERVICE_URL, true, mockAPIResponse.tenant.schemaName).onCall(0).returns(Promise.resolve('false'));

        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.INTERNAL_ERROR);
                done();
            })
            .catch(done);
    });

    it("Verify error if the feature toggle api fails", done => {
        let featurePath = constants.CHECK_FT_STATUS_API + constants.EXPORT_FT;
        let token = mockEvent.headers.Authorization.split(" ")[1];
        performGetRequestToCXoneStub.withArgs(constants.CURRENT_API, token, process.env.SERVICE_URL, false)
            .onCall(0).returns(Promise.resolve(JSON.stringify(mockAPIResponse)));
        performGetRequestToCXoneStub.withArgs(featurePath, token, process.env.SERVICE_URL, true, mockAPIResponse.tenant.schemaName)
            .onCall(0).returns(Promise.reject(constants.INVALID_TOKEN));

        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.INTERNAL_ERROR);
                done();
            })
            .catch(done);
    });

    it("Verify executor method returns true when event has valid request", async () => {
        let isEventValid = executor.verifyEvent();
        expect(isEventValid).to.equal(true);
    });

    it("Verify executor method returns false when event has no request", async () => {
        let invalidEvent = {
            "evolveAuth": {
                "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        let executorWithInvalidEvent = new Executor(invalidEvent, {});
        let isEventValid = executorWithInvalidEvent.verifyEvent();
        expect(isEventValid).to.equal(false);
    });

    it("Verify executor method returns false when report name is not Adherence", async() => {
        let invalidEvent = {
            "reportName" : "ABC",
            "evolveAuth": {
                "token" : "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        let executorWithInvalidEvent = new Executor(invalidEvent,{});
        let isEventValid = executorWithInvalidEvent.verifyEvent();
        expect(isEventValid).to.equal(false);
    });

    it("Verify executor method returns false when date range is incorrect", async() => {
        let invalidEvent = {
            "reportName": "adherenceV2",
            "reportDateRange": {
                "from": "2022-10-03"
            },
            "evolveAuth": {
                "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        let executorWithInvalidEvent = new Executor(invalidEvent, {});
        let isEventValid = executorWithInvalidEvent.verifyEvent();
        expect(isEventValid).to.equal(false);

        invalidEvent = {
            "reportName": "adherenceV2",
            "reportDateRange": {
                "to": "2022-10-03"
            },
            "evolveAuth": {
                "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        executorWithInvalidEvent = new Executor(invalidEvent, {});
        isEventValid = executorWithInvalidEvent.verifyEvent();
        expect(isEventValid).to.equal(false);
    });

    it("Verify executor method returns false when query is not present", async() => {
        let invalidEvent = {
            "reportName": "adherenceV2",
            "reportDateRange": {
                "from": "2022-10-03",
                "to": "2022-10-03"
            },
            "evolveAuth": {
                "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        let executorWithInvalidEvent = new Executor(invalidEvent, {});
        let isEventValid = executorWithInvalidEvent.verifyEvent();
        expect(isEventValid).to.equal(false);
    });

    it("Verify failure in handler method when event verification fails", done => {
        let featurePath = constants.CHECK_FT_STATUS_API + constants.EXPORT_FT;
        let token = mockEvent.headers.Authorization.split(" ")[1];
        performGetRequestToCXoneStub.withArgs(constants.CURRENT_API, token, process.env.SERVICE_URL, false)
            .onCall(0).returns(Promise.resolve(JSON.stringify(mockAPIResponse)));
        performGetRequestToCXoneStub.withArgs(featurePath, token, process.env.SERVICE_URL, true, mockAPIResponse.tenant.schemaName)
            .onCall(0).returns(Promise.resolve(true));
        mockEvent.body = {};

        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.BAD_REQUEST);
                done();
            })
            .catch(done);
    });

    it("Verify executor method returns empty list when no users are fetched", async () => {
        let response = mockAPIResponse;
        response.users = [];
        performGetRequestToCXoneStub.resolves(JSON.stringify(response));
        let userIds = await executor.getUsersFromUH();
        expect(userIds.length).to.equal(0);
    });

    it("Verify executor method returns non empty list when users are present", async () => {
        performGetRequestToCXoneStub.resolves(JSON.stringify(mockAPIResponse));
        let userIds = await executor.getUsersFromUH();
        expect(userIds.length).to.equal(2);
    });

    it("Verify failure in handler method when users API fails", done => {
        let featurePath = constants.CHECK_FT_STATUS_API + constants.EXPORT_FT;
        let token = mockEvent.headers.Authorization.split(" ")[1];
        performGetRequestToCXoneStub.withArgs(constants.CURRENT_API, token, process.env.SERVICE_URL, false)
            .onCall(0).returns(Promise.resolve(JSON.stringify(mockAPIResponse)));
        performGetRequestToCXoneStub.withArgs(featurePath, token, process.env.SERVICE_URL, true, mockAPIResponse.tenant.schemaName)
            .onCall(0).returns(Promise.resolve(true));
        performGetRequestToCXoneStub.withArgs(constants.USER_HUB_API, token, process.env.SERVICE_URL, true, mockAPIResponse.tenant.schemaName)
            .onCall(0).returns(Promise.reject(constants.INVALID_TOKEN));

        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.INTERNAL_ERROR);
                done();
            })
            .catch(done);
    });

    it("Verify generate file name executor method", async () => {
        let fileName = await executor.generateFileName();
        expect(fileName.split("_")[0].length).to.equal(14);
        expect(fileName.split("_")[1]).to.equal("pm.kepler.administrator@wfosaas.com.csv");
    });

});

describe('WFM RTA export report failure test cases', function () {
    this.timeout(3000);

    let s3Failure = "Fail to upload file to s3";
    beforeEach(function () {
        mockEvent = JSON.parse(JSON.stringify(require('./mocks/mockEvent.json')));
        process.env.SERVICE_URL = "";
        executor = new Executor(mockEvent, {});
        AWSMock.mock('S3', 'upload', function (params, callback) {
            callback(s3Failure, null);
        });
    });

    it("Report export Fail without host", done => {
        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.INTERNAL_ERROR);
                done();
            })
            .catch(done);
    });

    it("Report export Fail when headers are missing", done => {
        mockEvent.headers = {};
        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.BAD_REQUEST);
                done();
            })
            .catch(done);
    });

    it("Report export Fail when token is invalid", done => {
        mockEvent.headers.Authorization = "This is invalid token";
        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.exist;
                expect(error.message).to.equal(constants.BAD_REQUEST);
                done();
            })
            .catch(done);
    });

    it("Verify failure while uploading file to s3", done => {
        let fileName = "ABC.csv";
        let data = "";
        executor.saveAdherenceFileToS3(fileName, data).catch(error => {
            expect(error.message).to.equal(JSON.stringify(s3Failure));
            done();
        });
    });
});
