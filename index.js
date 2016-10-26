'use strict';

var util = require('util');
var http = require('http');
var express = require('express');

var router = express.Router();

router.get('/', combine);

module.exports = router;

function combine(req, res) {
    var mappingPointKeys = Object.keys(req.query);
    if (!mappingPointKeys.length) {
        // note: at least one query param should be defined
        res.sendStatus(400);
        return;
    }

    var requests = mappingPointKeys.length;
    var combinedResults = {};
    var responsesQueue = [];

    const options = {
        checkTransferEncodingForChunked: req.app.get('request-combiner::sync.when.chunked') !== 'disabled'
    };

    // note: we suppose that request will go to the same "enter point" to get all possible benefits of infrustructure (ballancing, caching and etc.)
    var hostPortPair = req.get('host').split(':');
    var reqOptions = {
        protocol: req.protocol + ':',
        hostname: hostPortPair[0],
        port: hostPortPair[1],
        method: 'GET',
        headers: req.headers
    };

    mappingPointKeys.forEach(
        (routeMapPoint) => doRequest(
            options,
            reqOptions,
            routeMapPoint,
            req.query[routeMapPoint],
            onRequestDone.bind(this, routeMapPoint), // note: just because I'm lazy, [bind] is super slow, I know
            onRequestQueue.bind(this, routeMapPoint), // note: ...
            onRequestError
        ));

    function onRequestDone(mappingPointKey, value) {
        combinedResults[mappingPointKey] = value;
        checkIfReady();
    }

    function onRequestQueue(mappingPointKey, res) {
        responsesQueue.push({ mappingPointKey: mappingPointKey, response: res });
        checkIfReady();
    }

    function onRequestError(e) {
        console.log(`problem with request: ${e.message}`);
        throw e;
    }

    function checkIfReady() {
        if (--requests) {
            return;
        }

        if (responsesQueue.length) {
            writeCombinedResultSync(res, combinedResults, responsesQueue);
        } else {
            res.send(combinedResults);
        }
    }
}


function writeCombinedResultSync(res, partialCombinedResults, responsesQueue) {
    res.write('{');

    Object.keys(partialCombinedResults).forEach(function (mappingPointKey) {
        res.write(JSON.stringify(mappingPointKey));
        res.write(':');
        res.write(JSON.stringify(partialCombinedResults[mappingPointKey]));
        res.write(',');
    });

    writeResponseDataSync(res, responsesQueue.shift(), function onDone() {
        if (responsesQueue.length > 0) {
            res.write(',');
            writeResponseDataSync(res, responsesQueue.shift(), onDone);
            return;
        }
        res.end('}');
    });
}

function writeResponseDataSync(res, sync, done) {
    const isJson = isResponseJson(sync.response);

    res.write(JSON.stringify(sync.mappingPointKey));
    res.write(':');

    if (isJson) {
        sync.response.on('data', (chunk) => res.write(chunk));
        sync.response.on('end', done);
    } else {
        res.write('"');
        sync.response.on('data', (chunk) => res.write(JSON.stringify(chunk.toString()).slice(1, -1)));
        sync.response.on('end', () => {
            res.write('"');
            done();
        });
    }
}


function doRequest(options, requestOptions, mappingPointKey, path, done, queue, error) {
    requestOptions.path = path;

    http
        .request(requestOptions, (res) => processResponse(options, res, done, queue))
        .on('error', error)
        .end();
}

function processResponse(options, res, done, queue) {
    if (options.checkTransferEncodingForChunked && isResponseChunked(res)) {
        queue(res);
        return;
    }

    var data = '';

    res.on('data', (chunk) => data += chunk);
    res.on('end', onEnd);

    function onEnd() {
        if (isResponseJson(res) && data) {
            data = JSON.parse(data);
        }

        done(200 <= res.statusCode && res.statusCode < 300
            ? data
            : { statusCode: res.statusCode, statusMessage: res.statusMessage, statusBody: data });
    }
}

function isResponseChunked(res) {
    const transferEncoding = res.headers['transfer-encoding'];
    return transferEncoding === 'chunked';
}

function isResponseJson(res) {
    const contentType = res.headers['content-type'];
    return util.isString(contentType) && contentType.length > 0 && !!~contentType.indexOf('application/json');
}