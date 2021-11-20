export class WorldEditor {
  constructor( world ) {
    if ( ! world.worldManager ) {
      throw "World editor requires connection to the server - enter a world first";
    }
    this.world = world;
    this.scene = world.scene;
    this.camera = world.scene.activeCamera;
    this.worldManager = world.worldManager;
    this.editingObjects=[];
    this.makeUI();
    this.installClickHandler();
    this.createButtons();
    this.worldManager.loadCallback = (object, rootMesh) => this.objectLoaded(object, rootMesh);    
  }
  
  makeUI() {
    this.uiRoot = new BABYLON.TransformNode("SearchUI");

    this.uiRoot.position.y = 2;
    this.guiManager = new BABYLON.GUI.GUI3DManager(this.scene);
    this.panel = new BABYLON.GUI.CylinderPanel();
    this.panel.margin = 0.05;
    this.panel.columns = 6;
    this.guiManager.addControl(this.panel);
    this.panel.linkToTransformNode(this.uiRoot);
    //panel.position.z = -1.5;

    this.buttonPrev = new BABYLON.GUI.HolographicButton("prev");
    this.buttonPrev.imageUrl = "https://www.babylonjs-playground.com/textures/icons/Upload.png";
    this.guiManager.addControl(this.buttonPrev);
    this.buttonPrev.linkToTransformNode(this.uiRoot);
    this.buttonPrev.position = new BABYLON.Vector3(-4,0,4);
    this.buttonPrev.mesh.rotation = new BABYLON.Vector3(0,0,Math.PI/2);
    this.buttonPrev.tooltipText = "Previous";
    this.buttonPrev.isVisible = false;

    this.buttonNext = new BABYLON.GUI.HolographicButton("next");
    this.buttonNext.imageUrl = "https://www.babylonjs-playground.com/textures/icons/Upload.png";
    this.guiManager.addControl(this.buttonNext);
    this.buttonNext.linkToTransformNode(this.uiRoot);
    this.buttonNext.position = new BABYLON.Vector3(4,0,4);
    this.buttonNext.mesh.rotation = new BABYLON.Vector3(0,0,-Math.PI/2);
    this.buttonNext.tooltipText = "Next";
    this.buttonNext.isVisible = false;
  }
  
  createButtons() {
    this.buttons = [];
    this.buttonLeft = -.2+0.025/2;
  
    this.rotateButton = this.makeAButton( "Rotate", "https://www.babylonjs-playground.com/textures/icons/Refresh.png", (o)=>this.rotateObject(o));  
    this.scaleButton = this.makeAButton("Resize", "/content/icons/resize.png", (o)=>this.resizeObject(o));
    this.alignButton = this.makeAButton("Align", "https://www.babylonjs-playground.com/textures/icons/Download.png", (o)=>this.alignObject(o));
    this.alignButton = this.makeAButton("Upright", "https://www.babylonjs-playground.com/textures/icons/Upload.png", (o)=>this.upright(o));
    this.deleteButton = this.makeAButton("Remove", "https://www.babylonjs-playground.com/textures/icons/Delete.png", (o)=>this.removeObject(o));
    this.searchButton = this.makeAButton("Search", "https://www.babylonjs-playground.com/textures/icons/Zoom.png");
    
    this.searchButton.onPointerDownObservable.add( () => this.relocatePanel());
    this.displayButtons(false);
  }

  makeAButton(text, imageUrl, action) {
    var button = new BABYLON.GUI.HolographicButton(text+"Button");
    this.guiManager.addControl(button);
    button.imageUrl = imageUrl;
    button.text=text;
    button.position = new BABYLON.Vector3(this.buttonLeft,-0.1,.5);
    button.scaling = new BABYLON.Vector3( .05, .05, .05 );
    button.mesh.parent = this.camera;
    button.onPointerDownObservable.add( () => {
      if ( this.activeButton == button ) {
        // already pressed, turn it off
        this.activeButton = null;
        this.displayButtons(true);
      } else {
        this.displayButtons(false);
        button.isVisible = true;
        this.activeButton = button;
      }
    });
    button.customAction = action;
    this.buttons.push( button );
    this.buttonLeft += .075;
    return button;
  }
  
  async _initWriter() {
    if ( ! this.Writer ) {
      await VRSPACEUI.loadScriptsToDocument([ 
        "https://cdn.rawgit.com/BabylonJS/Extensions/master/MeshWriter/meshwriter.min.js"
      ]);
      this.Writer = BABYLON.MeshWriter(this.scene, {scale:.02,defaultFont:"Arial"});
    }
  }
  
  async write(button, text) {
    await this._initWriter();
    if ( button.textMesh ) {
      button.textMesh.dispose();
      button.textParent.dispose();
      delete button.textMesh;
      delete button.textParent;
    }
    if ( text && text.length > 0 ) {
      button.textMesh = new this.Writer(
                          text,
                          {
                              anchor: "center",
                              "letter-height": 8,
                              color: "#1C3870",
                          }
                      );
      button.textParent = new BABYLON.TransformNode('textParent');
      button.textParent.parent = button.node;
      button.textParent.position.z = -1;
      
      button.textMesh.getMesh().rotation.x = -Math.PI/2;
      button.textMesh.getMesh().parent = button.textParent;
    }
  }
  
  objectLoaded( vrObject, rootMesh ) {
    console.log("Loaded:");
    console.log(vrObject);
    if ( vrObject.properties && vrObject.properties.editing == this.worldManager.VRSPACE.me.id ) {
      VRSPACEUI.indicator.remove("Download");
      this.editingObjects.push(vrObject.id);
      console.log("Loaded my object "+vrObject.id)
      this.take(vrObject);
      // CHECKME: in case of instancing existing container, it may not be displayed yet, does not resize
      setTimeout( () => {
        var scale = 1/this.worldManager.bBoxMax(rootMesh);
        //var scale = 1/this.worldManager.bBoxMax(this.worldManager.getRootNode(vrObject));
        this.worldManager.VRSPACE.sendEvent(vrObject, {scale: { x:scale, y:scale, z:scale }} );
      }, 100 );
    }
  }

  manipulateObject(obj, action) {
    if ( ! action ) {
      this.displayButtons(true);
      return;
    }
    action(obj);
  }
  
  resizeObject(obj) {
    var point;
    var resizeHandler = this.scene.onPointerObservable.add((pointerInfo) => {
      if ( pointerInfo.type == BABYLON.PointerEventTypes.POINTERDOWN ) {
        point = pointerInfo.pickInfo.pickedPoint;
      }
      if ( pointerInfo.type == BABYLON.PointerEventTypes.POINTERUP ) {
        this.scene.onPointerObservable.remove(resizeHandler);
        if ( pointerInfo.pickInfo.hit && VRSPACEUI.findRootNode(pointerInfo.pickInfo.pickedMesh) == obj ) {
          var diff = pointerInfo.pickInfo.pickedPoint.y - point.y;
          var bbox = this.worldManager.bBoxMax(obj);
          console.log("bBoxMax:"+bbox+" diff:"+diff+" scaling:"+obj.scaling.y);
          //var scale = obj.scaling.y + diff;
          var scale = obj.scaling.y*(bbox+diff)/bbox;
          scale = Math.max(scale, obj.scaling.y * .2);
          scale = Math.min(scale, obj.scaling.y * 5);
          console.log("Scaling: "+obj.scaling.y+" to "+scale); 
          this.worldManager.VRSPACE.sendEvent(obj.VRObject, {scale: { x:scale, y:scale, z:scale }} );
        }
      }
    });
  }
  rotateObject(obj) {
    var point;
    var rotateHandler = this.scene.onPointerObservable.add((pointerInfo) => {
      if ( pointerInfo.type == BABYLON.PointerEventTypes.POINTERDOWN ) {
        point = pointerInfo.pickInfo.pickedPoint;
      }
      if ( pointerInfo.type == BABYLON.PointerEventTypes.POINTERUP ) {
        this.scene.onPointerObservable.remove(rotateHandler);
        if ( pointerInfo.pickInfo.hit && VRSPACEUI.findRootNode(pointerInfo.pickInfo.pickedMesh) == obj ) {
          var dest = pointerInfo.pickInfo.pickedPoint;

          //var center = obj.position;
          var center = new BABYLON.Vector3(obj.position.x, (dest.y+point.y)/2, obj.position.z);
          var vFrom = point.subtract(center).normalize();
          var vTo = dest.subtract(center).normalize();
           
          var rotationMatrix = new BABYLON.Matrix();
          BABYLON.Matrix.RotationAlignToRef(vFrom, vTo, rotationMatrix);
          var quat = BABYLON.Quaternion.FromRotationMatrix(rotationMatrix);
          var result = BABYLON.Quaternion.FromEulerVector(obj.rotation).multiply(quat).toEulerAngles();

          console.log( obj.rotation+"->"+result);

          // vertical pointer movement:
          var dy = dest.y - point.y;
          // horizontal pointer movement:
          var dxz = new BABYLON.Vector3(dest.x,0,dest.z).subtract(new BABYLON.Vector3(point.x,0,point.z)).length();
          if ( Math.abs(dxz) > Math.abs(dy*3) ) {
            // mostly horizontal movement, rotation only around y
            console.log("Y rotation")
            this.worldManager.VRSPACE.sendEvent(obj.VRObject, {rotation: { x:obj.rotation.x, y:result.y, z:obj.rotation.z}} );
          } else {
            // rotating around all axes
            this.worldManager.VRSPACE.sendEvent(obj.VRObject, {rotation: { x:result.x, y:result.y, z:result.z}} );
          }

        }
      }
    });
  }
  
  
  alignObject(obj) {
    var origin = obj.position;
    var direction = new BABYLON.Vector3(0,-1,0);
    var length = 100;
    var ray = new BABYLON.Ray(origin, direction, length);
    var pickInfo = this.scene.pickWithRay(ray, (mesh) => {
      var pickedRoot = VRSPACEUI.findRootNode(mesh);
      return pickedRoot != obj;
    });
    console.log(pickInfo);
    var y = obj.position.y - pickInfo.distance;
    this.worldManager.VRSPACE.sendEvent(obj.VRObject, {position: { x:obj.position.x, y:y, z:obj.position.z }} );
  }
  
  upright(obj) {
    this.worldManager.VRSPACE.sendEvent(obj.VRObject, {rotation: { x:0, y:obj.rotation.y, z:0 }} );
  }

  removeObject(obj) {
    this.worldManager.VRSPACE.deleteSharedObject(obj.VRObject);
  }

  displayButtons(show) {
    this.buttons.forEach( button => button.isVisible = show);
    this.displayingButtons = show;
    if ( show ) {
      this.activeButton = null;
    }
  }  
  
  relocatePanel() {
    var forwardDirection = this.camera.getForwardRay(6).direction;
    this.uiRoot.position = this.camera.position.add(forwardDirection);
    this.uiRoot.rotation = new BABYLON.Vector3(this.camera.rotation.x,this.camera.rotation.y,this.camera.rotation.z);
    this.displayButtons(true);
  }
  
  installClickHandler() {
    this.clickHandler = this.scene.onPointerObservable.add((pointerInfo) => {
      var pickedRoot = VRSPACEUI.findRootNode(pointerInfo.pickInfo.pickedMesh);
      switch (pointerInfo.type) {
        case BABYLON.PointerEventTypes.POINTERDOWN:
          if ( this.activeButton ) {
            if ( pickedRoot.VRObject && this.activeButton.isVisible) {
              // make an action on the object
              console.log("Manipulating shared object "+pickedRoot.VRObject.id+" "+pickedRoot.name);
              this.manipulateObject(pickedRoot, this.activeButton.customAction);
            }
          } else {
            this.taking = pickedRoot;
          }
          break;
        case BABYLON.PointerEventTypes.POINTERUP:
          if ( this.taking == pickedRoot && pickedRoot.VRObject ) {
            var vrObject = pickedRoot.VRObject;
            console.log("Picked shared object "+vrObject.id+" "+pickedRoot.name);
            console.log(this.editingObjects);
            if ( ! this.editingObjects.includes(vrObject.id)) {
              this.editingObjects.push(vrObject.id);
              this.take(vrObject, pickedRoot.absolutePosition);
            }
          }
          break;
      }
    });
  }
  
  take(obj, position) {
    this.taking = null;
    if ( obj.changeListener ) {
      // already tracking
      return;
    }
    var root = this.worldManager.getRootNode(obj);

    // default position
    if ( ! position ) {
      var forwardDirection = this.camera.getForwardRay(2).direction;
      var forwardLower = forwardDirection.add(new BABYLON.Vector3(0,-.5,0));
      position = this.camera.position.add(forwardLower);
      obj.position.x = position.x;
      obj.position.y = position.y;
      obj.position.z = position.z;
      this.sendPos(obj);
    }

    // create an object and bind it to camera to track the position
    var targetDirection = position.subtract(this.camera.position);
    var forwardDirection = this.camera.getForwardRay(targetDirection.length()).direction;

    var rotationMatrix = new BABYLON.Matrix();
    BABYLON.Matrix.RotationAlignToRef(forwardDirection.normalizeToNew(), targetDirection.normalizeToNew(), rotationMatrix);
    var quat = BABYLON.Quaternion.FromRotationMatrix(rotationMatrix);

    var pos = new BABYLON.Vector3(0,0,targetDirection.length());
    pos.rotateByQuaternionToRef(quat, pos);
    
    var target = BABYLON.MeshBuilder.CreateBox("Position of "+obj.id, {size: .5}, this.scene);
    target.isPickable = false;
    target.isVisible = false;
    target.position = pos;
    if ( obj.rotation ) {
      var rot = new BABYLON.Vector3(obj.rotation.x, obj.rotation.y, obj.rotation.z);
      var quat = BABYLON.Quaternion.FromEulerVector(rot);
      quat = BABYLON.Quaternion.Inverse(this.camera.absoluteRotation).multiply(quat);
      target.rotation = quat.toEulerAngles()
    }
    target.parent = this.camera;
    obj.target = target;
    
    obj.changeListener = () => this.sendPos(obj);
    this.worldManager.addMyChangeListener( obj.changeListener );
    setTimeout( () => {
      obj.clickHandler = this.scene.onPointerObservable.add((pointerInfo) => {
        var pickedRoot = VRSPACEUI.findRootNode(pointerInfo.pickInfo.pickedMesh);
        switch (pointerInfo.type) {
          case BABYLON.PointerEventTypes.POINTERDOWN:
            if(pointerInfo.pickInfo.hit && pickedRoot == root) {
              this.dropping = root;
            }
            break;
          case BABYLON.PointerEventTypes.POINTERUP:
            if(pointerInfo.pickInfo.hit && pickedRoot == root && this.dropping == root) {
              this.drop(obj, position);
            }
            break;
        }
      }),
      100
    });
    console.log("took "+obj.id);
    this.displayButtons(false);
  }

  sendPos(obj) {
    var rot = this.camera.rotation;
    var pos = obj.position;
    if ( obj.target ) {
      pos = obj.target.absolutePosition;
      rot = obj.target.absoluteRotationQuaternion.toEulerAngles();
    }
    this.worldManager.VRSPACE.sendEvent(obj, {position: { x:pos.x, y:pos.y, z:pos.z }, rotation: {x:rot.x, y:rot.y, z:rot.z}} );
  }
  
  drop(obj) {
    this.dropping = null;
    var pos = this.editingObjects.indexOf(obj.id);
    if ( pos > -1 ) {
      this.editingObjects.splice(pos,1);
    }
    console.log("Dropping "+obj.target);
    
    this.scene.onPointerObservable.remove(obj.clickHandler);
    this.worldManager.removeMyChangeListener( obj.changeListener );
    delete obj.clickHandler;
    delete obj.changeListener;
    this.sendPos(obj);

    if ( obj.target ) {
      obj.target.parent = null;
      obj.target.dispose();
      obj.target = null;
    }
    this.worldManager.changeCallback = null;
    console.log("dropped "+obj.id);
    this.displayButtons(true);
  }

  search(text, args) {
      var url = new URL('https://api.sketchfab.com/v3/search');
      /*
      interesting params:
        categories - dropdown, radio? Array[string]
        downloadable
        animated
        rigged
        license: by = CC-BY, sketchfab default
      */
      var params = { 
          q:text,
          type:'models',
          downloadable:true
      };
      if ( args ) {
        for ( var arg in args ) {
          params[arg] = args[arg];
        }
      }
      url.search = new URLSearchParams(params).toString();

      this.doFetch(url);      
  }
  
  doFetch(url) {
      fetch(url).then(response => {
          response.json().then( obj=> {
              console.log(obj);
              this.panel.children.forEach( (button) => button.dispose() );

              this.buttonNext.isVisible = (obj.next != null);
              this.buttonNext.onPointerDownObservable.clear();
              this.buttonNext.onPointerDownObservable.add( () => {this.doFetch(obj.next)});
              this.buttonPrev.isVisible = (obj.previous != null);
              this.buttonPrev.onPointerDownObservable.clear();
              this.buttonPrev.onPointerDownObservable.add( () => {this.doFetch(obj.previous)});
                            
              obj.results.forEach(  result => {
                  // interesting result fields:
                  // next - url of next result page
                  // previous - url of previous page
                  //   for thumbnails.images, pick largest size, use url
                  //  archives.gltf.size
                  //  name
                  //  description
                  //  user.displayname
                  //  isAgeRestricted
                  //  categories.name
                  //console.log( result.description );
                  var thumbnail = result.thumbnails.images[0];
                  result.thumbnails.images.forEach( img => {
                    if ( img.size > thumbnail.size ) {
                      thumbnail = img;
                    }
                  });
                  //console.log(thumbnail);
                  
                  var button = new BABYLON.GUI.HolographicButton(result.name);
                  this.panel.addControl(button);

                  button.imageUrl = thumbnail.url;
                  
                  button.plateMaterial.disableLighting = true;
                  button.backMaterial.alpha = .5;

                  button.content.scaleX = 2;
                  button.content.scaleY = 2;
                  
                  button.onPointerEnterObservable.add( () => {
                      if ( ! button.textMesh ) {
                        this.write(button,result.name);
                      }
                  });
                  button.onPointerOutObservable.add( () => {
                      if ( button.textMesh ) {
                        this.write(button);
                      }
                  });
                  button.onPointerDownObservable.add( () => {
                    VRSPACEUI.indicator.animate();
                    VRSPACEUI.indicator.add("Download");
                    fetch("/sketchfab/download?uid="+result.uid)
                      .then(response => {
                          console.log(response);
                          if ( response.status == 401 ) {
                            console.log("Redirecting to login form")
                            this.sketchfabLogin();
                            return;
                          }
                          response.json().then(res => {
                            console.log(res);
                            this.worldManager.VRSPACE.createSharedObject({
                              mesh: res.mesh,
                              properties: {editing: this.worldManager.VRSPACE.me.id},
                              position:{x:0, y:0, z:0},
                              active:true
                            }, (obj)=>{
                              console.log("Created new VRObject", obj);
                            });
                          });
                      }).catch( err => console.log(err) );
                  });
                  
              });
          });
      }).catch( err => console.log(err));
  }
  
  sketchfabLogin() {
    fetch("/sketchfab/login").then(response => {
        console.log(response);
        response.json().then(login => {
          window.open( login.url, "_self" );
        });
    });
  }
}