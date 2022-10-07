'use strict';

let expect = require('chai').expect;
let rewire = require("rewire");
let sinon = require("sinon");
let LambdaTester = require('lambda-tester');
let LambdaUtils = require('../LambdaUtils.js');
let mainModule = rewire('../index.js');
let Handler = mainModule.handler;
let Executor = mainModule.Executor;
let executor;
var mockEvent, performGetRequestToCXoneStub, mockAPIResponse;

describe('WFM RTA export report test', function () {
    this.timeout(3000);
    var getMockEvent = function (eventData) {
        return eventData;
    };

    beforeEach(function () {
        mockEvent = getMockEvent(JSON.parse(JSON.stringify(require('./mocks/mockEvent.json'))));
        mockAPIResponse = getMockEvent(JSON.parse(JSON.stringify(require('./mocks/mockAPIResult.json'))));
        process.env.SERVICE_URL = "https://na1.test.nice-incontact.com";
        performGetRequestToCXoneStub = sinon.stub(LambdaUtils, 'performGetRequestToCXone');
        executor = new Executor(mockEvent, {});
    });

    afterEach(function(){
        performGetRequestToCXoneStub.restore();
    });

    it("Report export Done with status = 200", done => {
        let response = mockAPIResponse;
        response.users = [];
        performGetRequestToCXoneStub.resolves(JSON.stringify(response));
        LambdaTester(Handler)
            .event(mockEvent)
            .expectResult((result) => {
                expect(result.statusCode).to.exist;
                expect(result.statusCode).to.equal(200);
                expect(result.message).to.exist;
                expect(result.message).to.equal("hello world");
                done();
            })
            .catch(done);
    });

    it("Verify executor authenticate request method", async() => {
        performGetRequestToCXoneStub.resolves(JSON.stringify(mockAPIResponse));
        let result = await executor.authenticateRequest();
    });

    it("Verify handler failure while request authentication", done => {
        let errorMsg = {err: 'Invalid token'};
        performGetRequestToCXoneStub.rejects(errorMsg);
        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.equal(JSON.stringify(errorMsg));
                done();
            })
            .catch(done);
    });

    it("Verify executor authenticate request method", done => {
        let errorMsg = {err: 'Invalid token'};
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
                    "featureIds" : [ 141, 62, 111 ],
                    "settings" : { }
                }]
        }};
        performGetRequestToCXoneStub.resolves(JSON.stringify(tenant));
        await executor.authenticateRequest();
        let hasLicense = executor.verifyWFMLicense();
        expect(hasLicense).to.equal(false);
    });

    it("Verify executor method returns false when licenses are not present", async() => {
        let tenant = {"tenant" : { "licenses": [] }};
        performGetRequestToCXoneStub.resolves(JSON.stringify(tenant));
        await executor.authenticateRequest();
        let hasLicense = executor.verifyWFMLicense();
        expect(hasLicense).to.equal(false);
    });

    it("Verify executor method returns true when event has valid request", async() => {
        let isEventValid = executor.verifyEvent();
        expect(isEventValid).to.equal(true);
    });

    it("Verify executor method returns false when event has no request", async() => {
        let invalidEvent = {
            "evolveAuth": {
                "token" : "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        let executorWithInvalidEvent = new Executor(invalidEvent,{});
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
            "reportName" : "ABC",
            "reportDateRange" : {
                "from": "2022-10-03"
            },
            "evolveAuth": {
                "token" : "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        let executorWithInvalidEvent = new Executor(invalidEvent,{});
        let isEventValid = executorWithInvalidEvent.verifyEvent();
        expect(isEventValid).to.equal(false);
    });

    it("Verify executor method returns false when query is not present", async() => {
        let invalidEvent = {
            "reportName" : "ABC",
            "reportDateRange" : {
                "from": "2022-10-03",
                "to" : "2022-10-03"
            },
            "evolveAuth": {
                "token" : "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyOjExZThjMmQyLTY2OGEtNGFlMC05MzVmLTAyNDJhYzExMDAwMyIsInJvbGUiOnsibGVnYWN5SWQiOiJBZG1pbmlzdHJhdG9yIiwic2Vjb25kYXJ5Um9sZXMiOlt7ImlkIjoiMTFlOTA5MDAtN2NmZS0yMDcwLTkzNzUtMDI0MmFjMTEwMDA1IiwibGFzdFVwZGF0ZVRpbWUiOjE2MTIyMDM0NDEwMDB9XSwiaWQiOiIxMWU4YzJkMi02MzhjLWMyNTAtYjk5NC0wMjQyYWMxMTAwMDIiLCJsYXN0VXBkYXRlVGltZSI6MTY2NTA1MTQ5NDUyN30sImljQWdlbnRJZCI6IjMyNTgxMyIsImlzcyI6Imh0dHBzOlwvXC9hdXRoLnRlc3QubmljZS1pbmNvbnRhY3QuY29tIiwiZ2l2ZW5fbmFtZSI6IkVtaWx5IiwiYXVkIjoiaW5Db250YWN0IEV2b2x2ZUBpbkNvbnRhY3QuY29tIiwiaWNTUElkIjoiMTA0ODIiLCJpY0JVSWQiOjExMjYzMjE1NzgsIm5hbWUiOiJwbS5rZXBsZXIuYWRtaW5pc3RyYXRvckB3Zm9zYWFzLmNvbSIsInRlbmFudElkIjoiMTFlOGMyZDItNWZiZS1jYTYwLTg1MjQtMDI0MmFjMTEwMDA5IiwiZXhwIjoxNjY1MTQzMTQ2LCJpYXQiOjE2NjUxMzk1NDYsImZhbWlseV9uYW1lIjoiU21pdGgiLCJ0ZW5hbnQiOiJwZXJtX3BtX2tlcGxlcl90ZW5hbnQyNDEzNDg0MCIsInZpZXdzIjp7fSwiaWNDbHVzdGVySWQiOiJUTzMyIn0.Z-vcxglWSK83V7w0fxAKSNOjWktdH4FVb1fGPSe6Znrq9UqJR_vwqQwn3T88ceL3EnjhTAxFcAqGOCSv18Jz_l6MZayL7fAck3JcOMfm0zDFY-xC-YSfH8tcBSrrEoFn1EpRti9rzRTH9Hdsa5ogdVV4WS-3l-uCDjI0yqfodRo"
            }
        };
        let executorWithInvalidEvent = new Executor(invalidEvent,{});
        let isEventValid = executorWithInvalidEvent.verifyEvent();
        expect(isEventValid).to.equal(false);
    });

    it("Verify executor method returns empty list when no users are fetched", async() => {
        let response = mockAPIResponse;
        response.users = [];
        performGetRequestToCXoneStub.resolves(JSON.stringify(response));
        let userIds = await executor.getUsersFromUH();
        expect(userIds.length).to.equal(0);
    });

    it("Verify executor method returns non empty list when users are present", async() => {
        performGetRequestToCXoneStub.resolves(JSON.stringify(mockAPIResponse));
        let userIds = await executor.getUsersFromUH();
        expect(userIds.length).to.equal(2);
    });

    it("Verify executor method returns empty list when users API fails", async() => {
        let response={};
        response.tenant = mockAPIResponse.tenant;
        performGetRequestToCXoneStub.resolves(JSON.stringify(response));
        let userIds = await executor.getUsersFromUH();
        expect(userIds.length).to.equal(0);
    });

});

describe('WFM RTA export report  failure test cases', function () {
    this.timeout(3000);
    var getMockEvent = function (eventData) {
        return eventData;
    };

    beforeEach(function () {
        mockEvent = getMockEvent(JSON.parse(JSON.stringify(require('./mocks/mockEvent.json'))));
        process.env.SERVICE_URL = "";
    });

    it("Report export Fail without host", done => {
        LambdaTester(Handler)
            .event(mockEvent)
            .expectError(error => {
                expect(error.message).to.equal("FAILED TO VALIDATE HOST");
                done();
            })
            .catch(done);
    });
});
