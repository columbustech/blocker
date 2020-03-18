import React from 'react';
import Cookies from 'universal-cookie';
import axios from 'axios';
import './App.css';
import ConsoleOutput from './ConsoleOutput';
import CDriveSave from './CDriveSave';
import CDrivePathSelector from './CDrivePathSelector';

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      specs: {},
      isLoggedIn: false,
      aPath: "",
      aPathSelector: false,
      bPath: "",
      bPathSelector: false,
      oPath: "",
      oPathSelector: false,
      nA: "",
      nB: "",
      containerUrl: "",
      replicas: "",
      uid: "",
      fnStatus: "",
      fnMessage: "",
      fnStatusPollId: 0,
      elapsedTime: "",
      logsAvailable: false,
      logsPage: false,
      completePage: false,
      driveObjects: []
    };
    this.getSpecs = this.getSpecs.bind(this);
    this.authenticateUser = this.authenticateUser.bind(this);
    this.getDriveObjects = this.getDriveObjects.bind(this);
    this.startBlockFn = this.startBlockFn.bind(this);
    this.stopBlockFn = this.stopBlockFn.bind(this);
    this.fnStatusPoll = this.fnStatusPoll.bind(this);
  }
  getSpecs() {
    const request = axios({
      method: 'GET',
      url: `${window.location.protocol}//${window.location.hostname}${window.location.pathname}api/specs`
    });
    request.then(
      response => {
        this.setState({specs: response.data});
      },
    );
  }
  authenticateUser() {
    const cookies = new Cookies();
    var accessToken = cookies.get('blocker_token');
    if (accessToken !== undefined) {
      this.getDriveObjects().then(driveObjects => this.setState({driveObjects: driveObjects}));
      this.setState({isLoggedIn: true});
      return;
    }
    var url = new URL(window.location.href);
    var code = url.searchParams.get("code");
    var redirect_uri = `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/blocker/`;
    if (code == null) {
      window.location.href = `${this.state.specs.authUrl}o/authorize/?response_type=code&client_id=${this.state.specs.clientId}&redirect_uri=${redirect_uri}&state=1234xyz`;
    } else {
      const request = axios({
        method: 'POST',
        url: `${redirect_uri}api/access-token`,
        data: {
          code: code,
          redirect_uri: redirect_uri
        }
      });
      request.then(
        response => {
          cookies.set('blocker_token', response.data.access_token);
          window.location.href = redirect_uri;
        }, err => {
        }
      );
    }
  }
  getDriveObjects() {
    return new Promise(resolve => {
      const cookies = new Cookies();
      var auth_header = 'Bearer ' + cookies.get('blocker_token');
      const request = axios({
        method: 'GET',
        url: this.state.specs.cdriveApiUrl + "list-recursive/?path=users",
        headers: {'Authorization': auth_header}
      });
      request.then(
        response => {
          resolve(response.data.driveObjects);
        }, err => {
          if(err.response.status === 401) {
            cookies.remove('blocker_token');
            window.location.reload(false);
          } else {
            resolve([]);
          }
        }
      );
    });
  }
  startBlockFn() {
    this.setState({
      fnStatus: "Running",
      fnMessage: "Processing inputs",
      elapsedTime: "0s",
    });
    const cookies = new Cookies();
    const request = axios({
      method: 'POST',
      url: `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/blocker/api/block`,
      data: {
        aPath: this.state.aPath,
        nA: this.state.nA,
        bPath: this.state.bPath,
        nB: this.state.nB,
        containerUrl: this.state.containerUrl,
        replicas: this.state.replicas,
        accessToken: cookies.get('blocker_token')
      },
      headers: {
        'Authorization': `Bearer ${cookies.get('blocker_token')}`,
      }
    });
    request.then(
      response => {
        this.setState({ 
          uid: response.data.uid,
          fnStatusPollId: setInterval(() => this.fnStatusPoll(), 2000)
        });
      },
    );
  }
  stopBlockFn() {
  }
  fnStatusPoll() {
    const request = axios({
      method: 'GET',
      url: `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/blocker/api/status?uid=${this.state.uid}`
    });
    request.then(
      response => {
        if(response.data.fnStatus === "Complete" || response.data.fnStatus === "Error") {
          clearInterval(this.state.fnStatusPollId);
        }
        this.setState({
          fnStatus: response.data.fnStatus,
          fnMessage: response.data.fnMessage,
          elapsedTime: response.data.elapsedTime
        });
        if (response.data.logsAvailable === "Y") {
          this.setState({logsAvailable:true});
        }
      },
    );
  }
  render() {
    if (Object.keys(this.state.specs).length === 0) {
      this.getSpecs();
      return (null);
    } else if (!this.state.isLoggedIn) {
      this.authenticateUser();
      return (null);
    } else if(this.state.logsPage) {
      return (
        <ConsoleOutput toggle={() => this.setState({logsPage: false})} specs={this.state.specs} uid={this.state.uid} replicas={this.state.replicas}/>
      );
    } else if(this.state.completePage) {
      return (
        <CDriveSave toggle={() => this.setState({completePage: false})} specs={this.state.specs} uid={this.state.uid} driveObjects={this.state.driveObjects}/>
      );
    } else {
      let aPath, bPath;
      function getName(cDrivePath) {
        if (cDrivePath === "") {
          return ""
        }
        return cDrivePath.substring(cDrivePath.lastIndexOf("/") + 1);
      }
      aPath = getName(this.state.aPath);
      if (aPath === "") {
        aPath = "Choose Table A"
      }
      bPath = getName(this.state.bPath);
      if (bPath === "") {
        bPath = "Choose Table B";
      }
      let blockButton, abortButton;
      blockButton = (
        <button className="btn btn-lg btn-primary blocker-btn" onClick={this.startBlockFn}>
          Execute
        </button>
      );
      abortButton = (
        <button className="btn btn-lg btn-secondary blocker-btn" onClick={this.stopBlockFn}>
          Abort
        </button>
      );
      let statusClasses, actionButton, statusContainer;
      if(this.state.fnStatus !==  "") {
        if(this.state.fnStatus === "Complete") {
          actionButton = (
            <button className="btn btn-primary btn-sm ml-2" onClick={() => this.setState({completePage: true})}>
              <span className="h5 font-weight-normal">View Output</span>
            </button>
          );
          statusClasses = "h5 font-weight-normal";
        } else if(this.state.fnStatus === "Error") {
          if (this.state.logsAvailable) {
            actionButton = (
              <button className="btn btn-danger btn-sm ml-2" onClick={() => this.setState({logsPage: true})}>
                <span className="h5 font-weight-normal">View Logs</span>
              </button>
            );
          }
          statusClasses = "h5 font-weight-normal text-danger";
        } else {
          statusClasses = "h5 font-weight-normal";
        }
        statusContainer = (
          <div className="blocker-status">
            <span className={statusClasses}>{this.state.fnStatus} : {this.state.fnMessage}, Elapsed time: {this.state.elapsedTime}</span>
            {actionButton}
          </div>
        );
      }
      return(
        <div className="app-container">
          <div className="app-header">
            Blocker
          </div>
          <CDrivePathSelector show={this.state.aPathSelector} toggle={() => this.setState({aPathSelector : false})}
          action={path => this.setState({aPath: path})} title="Select CDrive Path to Table A"  actionName="Select"
          driveObjects={this.state.driveObjects} type="file" />
          <CDrivePathSelector show={this.state.bPathSelector} toggle={() => this.setState({bPathSelector : false})}
          action={path => this.setState({bPath: path})} title="Select CDrive Path to Table B"  actionName="Select"
          driveObjects={this.state.driveObjects} type="file" />
          <div className="input-div">
            <span className="mx-2">Table A:</span>
            <button className="btn btn-secondary mx-2" onClick={() => this.setState({aPathSelector : true})} >
              Browse
            </button>
            <span className="mx-2">{aPath}</span>
            <input type="text" placeholder="No of chunks" value={this.state.nA} className="blocker-text-input mx-2"
              onChange={e => this.setState({nA: e.target.value})} />
          </div>
          <div className="input-div">
            <span className="mx-2">Table B:</span>
            <button className="btn btn-secondary mx-2" onClick={() => this.setState({bPathSelector : true})} >
              Browse
            </button>
            <span className="mx-2">{bPath}</span>
            <input type="text" placeholder="No of chunks" value={this.state.nB} className="blocker-text-input mx-2"
              onChange={e => this.setState({nB: e.target.value})} />
          </div>
          <div className="input-div">
            <span className="mx-2">Block {"function"}:</span>
            <input type="text" placeholder="Container URL" value={this.state.containerUrl} className="blocker-text-input mx-2"
              onChange={e => this.setState({containerUrl: e.target.value})} />
            <input type="text" placeholder="No of Replicas" value={this.state.replicas} className="blocker-text-input mx-2"
              onChange={e => this.setState({replicas: e.target.value})} />
          </div>
          <div className="input-div text-center">
            {blockButton}
            {abortButton}
          </div>
          {statusContainer}
        </div>
      );
    }
  }
}

export default App;
