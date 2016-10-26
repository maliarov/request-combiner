'use strict';

const port = process.env.PORT || 3000;
const baseUrl = '/api';
const resourcesUrl = baseUrl + '/resources';

var requestCombinerMiddleware = require('../index.js');
var express = require('express');
var http = require('http');

var app = express();


init(app);


describe('Request-Combiner Middleware', function () {

    it('should be created', function (done) {
        expect(requestCombinerMiddleware).not.toBe(null);
        done();
    });

    it('should return {400, BadRequest} if no query params defined', function (done) {
        request(resourcesUrl, function (res, data) {
            expect(res.statusCode).toBe(400);
            expect(res.statusMessage).toBe('Bad Request');
            done();
        });
    });

    it('should return { user: { statusCode: 400 ... } } for /api/user/:id', function (done) {
        request(resourcesUrl + '?user=/api/users/1', function (res, data) {
            expect(res.statusCode).toBe(200);
            expectUserBadRequest(data.user, 'id');
            done();
        });
    });

    it('should return countries (with UA at least) and bad user ', function (done) {
        request(resourcesUrl + '?user=/api/users/1&countries=/api/countries', function (res, data) {
            expect(res.statusCode).toBe(200);

            expectUserBadRequest(data.user, 'id');
            expectCountriesMapWith(data.countries, 'UA', 'Ukraine');

            done();
        });
    });

    it('should return 2 customers, countries (with UA at least) with disabled chunked mode', function (done) {
        app.set('request-combiner::sync.when.chunked', 'disabled');

        request(resourcesUrl + '?user=/api/users/1&customers=/api/customers&countries=/api/countries', function (res, data) {
            expect(res.statusCode).toBe(200);

            expectUserBadRequest(data.user, 'id');
            expectTwoCustomers(data.customers);
            expectCountriesMapWith(data.countries, 'UA', 'Ukraine');

            done();
        });
    });

});


function request(path, callback) {
    var options = {
        hostname: 'localhost',
        path: path,
        port: port
    };

    http
        .request(options, function (res) {
            var data = '';

            if (!(200 <= res.statusCode && res.statusCode < 300)) {
                callback(res);
                return;
            }

            res.on('data', p => data += p);
            res.on('end', () => {
                data = data !== '' && data.length > 0 ? JSON.parse(data) : null;
                callback(res, data);
            });

        })
        .end();
}

function expectUserBadRequest(data, param) {
    expect(data).not.toBe(null);
    expect(data.statusCode).toBe(400);

    if (param) {
        expect(data.statusBody.param).toBe(param);
    }
}

function expectTwoCustomers(data) {
    expect(data).not.toBe(null);

    expect(data.length).toBe(2);
    expect(data[0].id).toBe(1);
}

function expectCountriesMapWith(data, countryKey, countryName) {
    expect(data).not.toBe(null);
    expect(data.StatusMsg).toBe('OK');
    expect(data.Results[countryKey]).not.toBe(null);
    expect(data.Results[countryKey].Name).toBe(countryName);
}


function init(app) {
    var usersRouter = express.Router();
    var countriesRouter = express.Router();
    var customersRouter = express.Router();

    const config = {
        endpoints: {
            countries: 'http://www.geognos.com/api/en/countries/info/all.json'
        }
    };

    usersRouter.get('/', usersQuery);
    usersRouter.get('/:id', usersGet);

    customersRouter.get('/', customersQuery);
    customersRouter.get('/:id', customersGet);

    countriesRouter.get('/', countriesQuery);
    countriesRouter.get('/:id', countriesGet);

    app.use('/api/users', usersRouter);
    app.use('/api/customers', customersRouter);
    app.use('/api/countries', countriesRouter);

    // note: inject our middleware
    app.use('/api/resources', requestCombinerMiddleware);


    function usersQuery(req, res) {
        res.status(400).send({ param: 'limit', status: 'required', message: '[limit] param is required' });
    }
    function usersGet(req, res) {
        res.status(400).send({ param: 'id', status: 'invalid', message: 'invalid [id]' });
    }
    function customersQuery(req, res) {
        res.send([{ id: 1, name: 'customer #1' }, { id: 2, name: 'customer #2' }]);
    }
    function customersGet(req, res) {
        res.send({ id: res.params.id, name: 'customer #' + res.params.id });
    }
    function countriesGet(req, res) {
        res.send({ title: 'Ukraine', codes: ['+38'] });
    }
    function countriesQuery(req, res) {
        http.get(config.endpoints.countries, callback);

        function callback(_res) {
            res.set('Content-Type', 'application/json');
            _res.resume();
            _res.pipe(res);
        }
    }

    app.listen(port);
}
