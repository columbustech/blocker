const express = require('express');
const server = express();
const PORT = process.env.PORT || 8001;

server.use(express.json());

var api = require('./api.js');

server.use('/api', api);

server.listen(PORT, () => {
  console.log(`Server listening at port ${PORT}`);
});
