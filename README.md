# request-combiner

Suppose you have an API 
- GET api/users, api/users/:id
- GET api/customers, api/customers:id
- GET api/countries etc


You also have a SPA where you fetch users and customers and countries from API to render some page.  Probably you don’t want to make 3 or 5 or 10 ajax requests, instead you want to GET all resources in one go.


The task
Make API handle that - build a reusable module/middleware for GETting multiple resources in one go. Should be easy to inject into any existing express app / api.


Example of final use
- GET api/resources?users=api/users&customer=api/customers/23&countries=api/countries...
  
  returns {users: [..], customer: {..}, countries: [..] } 


## USAGE



    var express = require('express');
    var app = express();
    ... 
    // here comes magic
    app.use('/api/resources', require('request-combiner'));
    ...    
    app.listen(port, () => console.log('app started!'));


By default, Middleware checking value of 'transfer-encoding' header and if it is defined then Middleware logic making separated synchronized query for such requests and trying to avoid possible "out of memory" cases by writing one-by-one  chunks of fetched data to response stream

you can disable that option by setting *request-combiner::sync.when.chunked* value to 'disabled'


    app.set('request-combiner::sync.when.chunked', 'disabled');
  
  
