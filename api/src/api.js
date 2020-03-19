const express = require('express');
const router = express.Router();
const request = require('request');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const mongo = require('mongodb').MongoClient;
const mongoUrl = 'mongodb://localhost:27017';
const csv = require('csv-parser');

router.get('/specs', function(req, res) {
  res.json({
    clientId: process.env.COLUMBUS_CLIENT_ID,
    authUrl: process.env.AUTHENTICATION_URL,
    cdriveUrl: process.env.CDRIVE_URL,
    cdriveApiUrl: process.env.CDRIVE_API_URL,
    username: process.env.COLUMBUS_USERNAME
  });
});

router.post('/access-token', function(req, res) {
  var code = req.body.code;
  var redirect_uri = req.body.redirect_uri;

  const options = {
    url: `${process.env.AUTHENTICATION_URL}o/token/`,
    form: {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirect_uri,
      client_id: process.env.COLUMBUS_CLIENT_ID,
      client_secret: process.env.COLUMBUS_CLIENT_SECRET
    }
  };

  var nestRes = request.post(options);
  nestRes.pipe(res);
});

router.post('/block', function(req, res) {
  var accessToken = req.headers["authorization"].split(" ")[1];

  var aPath = req.body.aPath;
  var nA = parseInt(req.body.nA);
  var bPath = req.body.bPath;
  var nB = parseInt(req.body.nB);
  var containerUrl = req.body.containerUrl;
  var replicas = req.body.replicas;

  var uid = [...Array(10)].map(i=>(~~(Math.random()*36)).toString(36)).join('');
  var fnName = `blockfn-${process.env.COLUMBUS_USERNAME}-${uid}`;

  mongo.connect(mongoUrl, function(err, client) {
    const db = client.db('blocker');
    const collection = db.collection('blockfns');
    collection.insertOne({
      uid: uid,
      username: process.env.COLUMBUS_USERNAME,
      fnName: fnName,
      fnStatus: "Running",
      fnMessage: "Processing inputs",
      startTime: Date.now()
    }, (insErr, insRes) => {
      res.json({uid:uid});
    });
    client.close();
  });

  function setStatus(execStatus, msg, isEnd) {
    return new Promise(resolve => {
      mongo.connect(mongoUrl, function(connectErr, client) {
        const db = client.db('blocker');
        const collection = db.collection('blockfns');
        var updateDoc = {fnStatus: execStatus, fnMessage: msg};
        if(isEnd) {
          updateDoc.endTime = Date.now();
        }
        collection.updateOne({uid: uid}, {$set: updateDoc}, function(upErr, upRes) {
          resolve();
          client.close();
        });
      });
    });
  }

  function checkInputs() {
    if (aPath === undefined || aPath === "" || !aPath.endsWith(".csv")) {
      setStatus("Error", "Please select a CSV file as table A", true);
    } else if (bPath === undefined || bPath === "" || !bPath.endsWith(".csv")) {
      setStatus("Error", "Please select a CSV file as table B", true);
    } else if (nA<1 || nA>100) {
      setStatus("Error", "Number of pieces should be an integer between 1 and 100", true);
    } else if (nB<1 || nB>100) {
      setStatus("Error", "Number of pieces should be an integer between 1 and 100", true);
    } else if (containerUrl === "") {
      setStatus("Error", "Please enter container URL", true);
    } else if (parseInt(replicas)<1 || parseInt(replicas)>50) {
      setStatus("Error", "Number of replicas should be an integer between 1 and 50", true);
    } else {
      return true;
    }
    return false;
  }

  function getTableUrl(tablePath) {
    return new Promise((resolve, reject) => {
      var options = {
        url: `${process.env.CDRIVE_API_URL}download/?path=${tablePath}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      };
      request(options, function(err, res, body) {
        if(err || res.statusCode != 200) {
          reject();
          return;
        }
        resolve(JSON.parse(body).download_url);
      });
    });
  }

  function createFns() {
    return new Promise((resolve, reject) => {
      var options = {
        url: "http://localhost:8080/create",
        method: "POST",
        form: {
          imagePath: containerUrl,
          fnName: fnName,
          replicas: replicas
        }
      };
      request(options, function(err, res, body) {
        if(err || res.statusCode != 200) {
          reject();
        } else {
          resolve();
        }
      });
    });
  }

  function ensureAllFnsActive() {
    return new Promise((resolve, reject) => {
      (function waitForContainer() {
        var options = {
          url: `http://localhost:8080/status?fnName=${fnName}`,
          method: "GET",
        };
        request(options, function(err, res, body) {
          var containerStatus = JSON.parse(body).fnStatus;
          if(containerStatus === "Running") {
            resolve(true);
          } else if (containerStatus === "Error") {
            setStatus("Error", "Could not create block function containers").then(reject);
          } else {
            setTimeout(waitForContainer, 500);
          }
        });
      })();
    });
  }

  function deleteFns() {
    var options = {
      url: "http://localhost:8080/delete",
      method: "POST",
      form: {
        fnName: fnName
      }
    };
    request(options, function(err, res, body) {
    });
  }

  function parseTable(url) {
    return new Promise((resolve, reject) => {
      const results = [];
      request.get(url).pipe(csv()).on('data', data => results.push(data)).on('end', () => resolve(results));
    });
  }

  function mapToContainer(aChunk, bChunk) {
    return new Promise((resolve, reject) => {
      function callBlock(attemptNo) {
        var options = {
          url: `http://${fnName}/block/`,
          method: "POST",
          form: {
            leftTuples: JSON.stringify(aChunk),
            rightTuples: JSON.stringify(bChunk)
          }
        };
        request(options, function (err, res, body) {
          if(res && res.statusCode === 500) {
            collectLogs().then(() => setStatus("Error", "Map function crashed", true)).then(() => deleteFns());
          } else if(err || res.statusCode !== 200) {
            setTimeout(() => callBlock(attemptNo + 1), 500);
          } else {
            var output = JSON.parse(JSON.parse(body).output).map(tuple => {
              Object.keys(tuple).forEach(key => {
                if(typeof(tuple[key]) === "object") {
                  tuple[key] = JSON.stringify(tuple[key]);
                }
              });
              return tuple;
            });
            resolve(output);
          }
        });
      }
      callBlock(1);
    });
  }

  function collectLogs() {
    return new Promise(resolve => {
      mongo.connect(mongoUrl, function(connectErr, client) {
        const db = client.db('blocker');
        const collection = db.collection('blockfns');
        collection.findOne({uid: uid}, function(findErr, doc) {
          requestLogs().then(logs => {
            var updateDoc = doc;
            updateDoc.logs = logs;
            collection.updateOne({uid: uid}, {$set: updateDoc}, function(upErr, upRes) {
              resolve();
              client.close();
            });
          });
        });
      });
    });
  }

  function requestLogs() {
    return new Promise(resolve => {
      var options = {
        url: `http://localhost:8080/logs?fnName=${fnName}`,
        method: "GET",
      };
      request(options, function(err, res, body) {
        var logs = JSON.parse(body);
        resolve(logs);
      });
    });
  }

  function saveOutput(jsonOutput, localPath) {
    var header = Object.keys(jsonOutput[0]).map(colName => ({id: colName, title: colName}));
    if(fs.existsSync(localPath)){
      const csvWriter = createCsvWriter({
        path: localPath,
        header: header,
        append: true
      });
      return csvWriter.writeRecords(jsonOutput);
    } else {
      const csvWriter = createCsvWriter({
        path: localPath,
        header: header,
      });
      return csvWriter.writeRecords(jsonOutput);
    }
  }

  function blockComplete() {
    setStatus("Complete", "Blocker executed successfully", true).then(() => deleteFns());
  }

  if(!checkInputs()) {
    return;
  }
  const aPromise = getTableUrl(aPath).then(url => parseTable(url), err => {
    return new Promise((resolve, reject) => reject());
  });
  const bPromise = getTableUrl(bPath).then(url => parseTable(url), err => {
    return new Promise((resolve, reject) => reject());
  });
  const fnPromise = createFns().then(success => ensureAllFnsActive(), err => {
    return new Promise((resolve, reject) => reject());
  });

  Promise.all([aPromise, bPromise, fnPromise]).then(values => {
    var tableA = values[0];
    var cla = Math.ceil(tableA.length/nA);
    var aChunks = Array.from({length: nA}).map((x,i) => {
      return tableA.slice(i*cla, (i+1)*cla);
    });
    var tableB = values[1];
    var clb = Math.ceil(tableB.length/nB);
    var bChunks = Array.from({length: nB}).map((x,i) => {
      return tableB.slice(i*clb, (i+1)*clb);
    });

    var inFlight = 3*replicas;
    var complete = 0;

    function fnComplete(tuples) {
      complete++;
      setStatus("Running", `Processed ${complete}/${nA*nB} chunks`, false);
      if (complete === nA*nB) {
        saveOutput(tuples, `/storage/output/${uid}.csv`).then(() => blockComplete());
      } else if (inFlight < nA*nB) {
        var aid = inFlight % nA;
        var bid = Math.floor(inFlight/nB);
        mapToContainer(aChunks[aid], bChunks[bid]).then(outs => fnComplete(outs));
        inFlight++;
        saveOutput(tuples, `/storage/output/${uid}.csv`);
      } else {
        saveOutput(tuples, `/storage/output/${uid}.csv`);
      }
    }
    Array.from({length: 3*replicas}).forEach((el, i) => {
      var aid = i % nA;
      var bid = Math.floor(i/nB);
      mapToContainer(aChunks[aid], bChunks[bid]).then(outs => fnComplete(outs));
    });
  }, err => {
    setStatus("Error", "Could not process inputs", true);
  });
});

router.post('/save', function(req, res) {
  var accessToken = req.headers["authorization"].split(" ")[1];
  var uid = req.body.uid;
  var path = req.body.path;
  var name = req.body.name;
	const uploadOptions = {
    url: `${process.env.CDRIVE_API_URL}upload/`,
    method: 'POST',
    formData: {
      path: path,
      file: {
        value: fs.createReadStream(`/storage/output/${uid}.csv`),
        options: {
          filename: name,
          contentType: 'text/csv'
        }
      }
    },
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  };
  request(uploadOptions, function(upErr, upRes, body){
    if(res.statusCode === 201 || res.statusCode === 200) {
      res.json({message: "success"});
    } else {
      res.status(401);
    }
  });
});

router.get('/status', function(req, res) {
  var uid = req.query.uid;
  mongo.connect(mongoUrl, function(connectErr, client) {
    const db = client.db('blocker');
    const collection = db.collection('blockfns');
    collection.findOne({uid: uid}, function(findErr, doc) {
      if (doc.logs === undefined) {
        doc.logsAvailable = "Y";
      } else {
        doc.logsAvailable = "N";
      }
      var endtime;
      if(!doc.endTime) {
        endTime = Date.now()
      } else {
        endTime = doc.endTime;
      }
      var elapsedTime = endTime - doc.startTime;
      var minutes = Math.floor(elapsedTime/60000);
      var seconds = Math.floor(elapsedTime/1000) - (60 * minutes);
      doc.elapsedTime = (minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
      res.json(doc);
      client.close();
    });
  });
});

router.get('/logs', function(req, res) {
  var uid = req.query.uid;
  var replicaNo = parseInt(req.query.replicaNo);
  mongo.connect(mongoUrl, function(connectErr, client) {
    const db = client.db('blocker');
    const collection = db.collection('blockfns');
    collection.findOne({uid: uid}, function(findErr, doc) {
      if (doc.logs !== undefined) {
        res.json({logs: doc.logs[replicaNo]});
      } else {
        res.json({logs: "No logs available for this replicas"});
      }
      client.close();
    });
  });
});

router.post('/abort', function(req, res) {
  var accessToken = req.headers["authorization"].split(" ")[1];
  var uid = req.body.uid;
  var fnName = `blockfn-${process.env.COLUMBUS_USERNAME}-${uid}`;

  function setStatus(execStatus, msg, isEnd) {
    return new Promise(resolve => {
      mongo.connect(mongoUrl, function(connectErr, client) {
        const db = client.db('blocker');
        const collection = db.collection('blockfns');
        var updateDoc = {fnStatus: execStatus, fnMessage: msg};
        if(isEnd) {
          updateDoc.endTime = Date.now();
        }
        collection.updateOne({uid: uid}, {$set: updateDoc}, function(upErr, upRes) {
          resolve();
          client.close();
        });
      });
    });
  }

  function deleteFns() {
    var options = {
      url: "http://localhost:8080/delete",
      method: "POST",
      form: {
        fnName: fnName
      }
    };
    request(options, function(err, res, body) {
    });
  }

  setStatus("Abort", "User aborted block functions", true).then(() => {
    res.json({message: "success"});
    deleteFns();
  });
});

module.exports = router;
