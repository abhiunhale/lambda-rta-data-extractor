'use strict';

let expect = require('chai').expect;
let rewire = require("rewire");
let LambdaTester = require('lambda-tester');
let mainModule = rewire('../index.js');
let Handler = mainModule.handler;
let Executor = mainModule.Executor;
var mockEvent;

describe('WFM RTA export report test', function () {
    this.timeout(30000);
    var getMockEvent = function (eventData) {
        return eventData;
    };

    beforeEach(function () {
        mockEvent = getMockEvent(JSON.parse(JSON.stringify(require('./mocks/mockEvent.json'))));
    });

    it("Report export Done with status = 200", done => {
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
});
