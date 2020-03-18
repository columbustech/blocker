import React from 'react';
import axios from 'axios';
import './ConsoleOutput.css';

class ConsoleOutput extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      output: "",
      specs: {},
      uid: "",
      replicas: 0,
      selectedReplica: "0",
    };
    this.getOutput = this.getOutput.bind(this);
    this.replicaChange = this.replicaChange.bind(this);
  }
  componentDidMount() {
    this.setState({
      specs: this.props.specs,
      uid: this.props.uid,
      replicas: this.props.replicas
    });
  }
  getOutput() {
    const request = axios({
      method: 'GET',
      url: `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/blocker/api/logs?uid=${this.state.uid}&replicaNo=${this.state.selectedReplica}`
    });
    request.then(
      response => {
        this.setState({output: response.data.logs});
      },
    );
  }
  replicaChange(e) {
    this.setState({
      selectedReplica: e.target.value
    }, () => this.getOutput());
  }
  render() {
    if (Object.keys(this.state.specs).length === 0) {
      return (null);
    } else if (this.state.output === "") {
      this.getOutput();
      return (null);
    } else {
      let lines;
      lines = this.state.output.split("\n").map((line, key) => 
        <span key={key}>  {line}<br /></span>
      );
      let options;
      options = Array.from({length: this.state.replicas}).map((x,i) => {
        if (i === 0) {
          return (
            <option value={i} selected>{i+1}</option>
          );
        } else {
          return (
            <option value={i}>{i+1}</option>
          );
        }
      });
      return(
        <div className="log-container" >
          <div className="replica-selector">
            <label htmlFor="replica-select-id">Replica No:</label>
            <select id="replica-select-id" onChange={this.replicaChange}>
              {options}
            </select>
          </div>
          <div className="terminal-output">
            {lines}
          </div>
          <div className="navigation-options">
            <button className="btn btn-primary btn-lg" onClick={() => this.props.toggle()} >
              Go Back
            </button>
          </div>
        </div>
      );
    }
  }
}

export default ConsoleOutput;
