import React from 'react';
import Cookies from 'universal-cookie';
import axios from 'axios';
import './App.css';
import ConsoleOutput from './ConsoleOutput';
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
      nA: "1",
      nB: "1",
      replicas: "",
      uid: "",
      fnStatus: "",
      fnStatusPollId: 0,
      elapsedTime: "",
      logsPage: false,
      driveObjects: []
    };
    this.getSpecs = this.getSpecs.bind(this);
    this.authenticateUser = this.authenticateUser.bind(this);
    this.getDriveObjects = this.getDriveObjects.bind(this);
    //this.startBlockFn = this.startBlockFn.bind(this);
    //this.toggleLogsPage = this.toggleLogsPage.bind(this);
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
      this.getDriveObjects().then(driveObjects => this.setState({isLoggedIn: true, driveObjects: driveObjects}));
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
  render() {
    if (Object.keys(this.state.specs).length === 0) {
      this.getSpecs();
      return (null);
    } else if (!this.state.isLoggedIn) {
      this.authenticateUser();
      return (null);
    } else if(this.state.logsPage) {
      return (
        <ConsoleOutput />
      );
    } else {
      return(
        <div className="app-container">
          <CDrivePathSelector show={this.state.aPathSelector} toggle={() => this.setState({aPathSelector : false})}
          action={path => this.setState({aPath: path})} title="Select CDrive Path to Table A"  actionName="Select"
          driveObjects={this.state.driveObjects} type="file" />
          <CDrivePathSelector show={this.state.bPathSelector} toggle={() => this.setState({bPathSelector : false})}
          action={path => this.setState({bPath: path})} driveObjects={this.state.driveObjects} />
          <button className="btn btn-secondary btn-lg" onClick={() => this.setState({aPathSelector : true})} >
            Browse
          </button>
          {this.state.aPath}
        </div>
      );
    }
  }
}

export default App;
