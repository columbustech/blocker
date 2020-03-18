import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import { FaFolder, FaFile } from 'react-icons/fa';
import './CDrivePathSelector.css';

class CDrivePathSelector extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      path: "users",
      selectedPath: "",
    };
    this.getListObjects = this.getListObjects.bind(this);
    this.breadcrumbClick = this.breadcrumbClick.bind(this);
    this.listItemClick = this.listItemClick.bind(this);
    this.selectAction = this.selectAction.bind(this);
  }
  getListObjects() {
   var tokens = this.state.path.split("/");
   var listObjects = this.props.driveObjects;
   for (var i=1; i<tokens.length; i++) {
    const token = tokens[i];
    listObjects = listObjects.find(element => (element.name === token)).children;
   }
   return listObjects;
  }
  breadcrumbClick(index) {
    var tokens = this.state.path.split("/");
    var newPath = tokens.slice(0,index+1).join("/");
    this.setState({path: newPath});
  }
  listItemClick(name, type) {
    var newPath = this.state.path + "/" + name;
    if (type === "Folder") {
      this.setState({path: newPath});
    } else if(type === "File" && this.props.type === "file") {
      this.setState({selectedPath:newPath});
    }
  }
  selectAction() {
    if (this.props.type === "folder") {
      this.props.action(this.state.path);
      this.props.toggle();
    } else if(this.props.type === "file") {
      this.props.action(this.state.selectedPath);
      this.props.toggle();
    }
  }
  render() {
    var tokens = this.state.path.split("/");
    let items;
    items = tokens.map((token, i) => {
      if(i === tokens.length - 1){
        return (
          <li className="breadcrumb-item active" aria-current="page">
            <button className="btn" disabled>{token}</button>
          </li>
        );
      } else {
        return (
          <li className="breadcrumb-item">
            <button onClick={() => this.breadcrumbClick(i)} className="btn btn-link">
              {token}
            </button>
          </li>
        );
      }
    });
    let rows;
    var listObjects = this.getListObjects();
    if(listObjects.length !== 0) {
      rows = listObjects.map((dobj, i) => {
        var name = dobj.name;
        if (name.length > 10) {
          name = name.substring(0,7) + "...";
        }
        if (dobj.type === "Folder") {
          return (
            <div className="folder-item drive-item" onClick={() => this.listItemClick(dobj.name, dobj.type)}>
              <div>
                <FaFolder size={60} color="#92cefe" />
              </div>
              <div className="drive-item-name">
                {name}
              </div>
            </div>
          );
        } else {
          if (`${this.state.path}/${dobj.name}` === this.state.selectedPath) {
            return (
              <div  className="file-item drive-item">
                <div className="selected-item">
                  <FaFile size={60} color="#9c9c9c" />
                </div>
                <div className="drive-item-name selected-item">
                  {name}
                </div>
              </div>
            );
          } else {
            return (
              <div  className="file-item drive-item" onClick={() => this.listItemClick(dobj.name, dobj.type)}>
                <div>
                  <FaFile size={60} color="#9c9c9c" />
                </div>
                <div className="drive-item-name">
                  {name}
                </div>
              </div>
            );
          }
        }
      });
    }
    return(
      <Modal show={this.props.show} onHide={this.props.toggle} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{this.props.title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="cdrive-path-selector" >
            <nav aria-label="breadcrumb">
              <ol className="breadcrumb bg-transparent">
                {items}
              </ol>
            </nav>
            <div className="folder-list">
              {rows}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={this.props.toggle}>
            Close
          </Button>
          <Button variant="primary" onClick={this.selectAction} >
            {this.props.actionName}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

export default CDrivePathSelector;
