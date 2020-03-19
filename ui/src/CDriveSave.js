import React from 'react';
import Cookies from 'universal-cookie';
import axios from 'axios';
import CDrivePathSelector from './CDrivePathSelector';
import './App.css';

class CDriveSave extends React.Component{
  constructor(props) {
    super(props);
    this.state = {
      path: "users",
      pathSelector: false,
      name: "",
      saved: false,
      saveStatus: ""
    };
    this.save = this.save.bind(this);
  }
  componentDidMount() {
    this.setState({path: `users/${this.props.specs.username}`});
  }
  save() {
    this.setState({saved: false});
    const cookies = new Cookies();
    const request = axios({
      method: 'POST',
      url: `${this.props.specs.cdriveUrl}app/${this.props.specs.username}/blocker/api/save`,
      data: {
        path: this.state.path,
        uid: this.props.uid,
        name: this.state.name
      },
      headers: {
        'Authorization': `Bearer ${cookies.get('blocker_token')}`,
      }
    },);
    request.then(response => {
      this.setState({saveStatus: "Saved output file to CDrive!", saved: true});
    }, err => {
      this.setState({saveStatus: "Could not save output file to CDrive", saved: true});
    });
  }
  render() {
    let statusContainer;
    if(this.state.saved) {
      statusContainer = (
        <div className="blocker-status">
          <span className="h5 font-weight-normal">{this.state.saveStatus}</span>
        </div>
      );
    }
    return (
      <div className="app-container">
        <div className="app-header">
          Save Output
        </div>
        <CDrivePathSelector show={this.state.pathSelector} toggle={() => this.setState({pathSelector : false})}
          action={p => this.setState({path: p})} title="Select output folder path"  actionName="Select this folder"
          driveObjects={this.props.driveObjects} type="folder" />

        <div className="input-div">
          <span className="mx-2">Output path:</span>
          <button className="btn btn-secondary mx-2" onClick={() => this.setState({pathSelector : true})} >
            Browse
          </button>
          <span className="mx-2">{this.state.path}/</span>
          <input type="text" placeholder="Output file name" value={this.state.name} className="blocker-text-input mx-2"
            onChange={e => this.setState({name: e.target.value})} />
        </div>

        <div className="input-div text-center">
          <button className="btn btn-primary btn-lg blocker-btn" onClick={this.save}>
            Save
          </button>
          <button className="btn btn-secondary btn-lg blocker-btn" onClick={() => this.props.toggle()} >
            Go Back
          </button>
        </div>
        {statusContainer}
      </div>
    );
  }
}

export default CDriveSave;
