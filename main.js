"use strict";

/* --------------------================-------------------- */
/*                    Utility  Functions                    */
/* --------------------================-------------------- */

(function() {
	function _generateElement(args, el) {
		let e = null;
		let _tci = args.shift().split(/\s*(?=[\.#])/); // tag, class, id
		if(/\.|#/.test(_tci[0])) e = el('div');
		_tci.forEach(function(v) {
			if(!e) e = el(v)
			else if(v[0] === '.') e.classList.add(v.slice(1))
			else if(v[0] === '#') e.setAttribute('id', v.slice(1))
		});
		function item(l) {
			switch (l.constructor) {
				case Array:
					l.forEach(item);
					break;
				case Object:
					for(let attr in l) {
						if(attr === 'style') {
							for(let style in l[attr]) {
								e.style[style] = l[attr][style];
							}
						}else if(attr.substr(0, 2) === 'on'){
							e.addEventListener(attr.substr(2), l[attr]);
						}else{
							e.setAttribute(attr, l[attr]);
						}
					}
					break;
				default:
					if(l.nodeType != undefined) e.appendChild(l)
    				else e.appendChild(document.createTextNode(l))
			}
		}
		while(args.length > 0) {
			item(args.shift());
		}
		return e;
	}

	window.h = function() {
		return _generateElement([].slice.call(arguments), function(tagName) {
			return document.createElement(tagName);
		});
	}

	window.svg = function() {
		return _generateElement([].slice.call(arguments), function(tagName) {
			return document.createElementNS('http://www.w3.org/2000/svg', tagName);
		});
	}
})(); // h, svg

(function() {
	let targets = [], callbacks = [];
	let down, x, y, dx, dy;

	window.mouse = {x: 100, y: 100, target: null};

	function setMouse(e) {
		mouse.x = e.clientX * viewBox.scale + viewBox.x;
		mouse.y = e.clientY * viewBox.scale + viewBox.y;
		mouse.shiftKey = e.shiftKey;
	}

	function _mousedown(fns, e) {
		targets.push(e.target);
		callbacks.push(fns);

		setMouse(e);
		x = mouse.x;
		y = mouse.y;
		down = true;

		if(callbacks.hasOwnProperty('mousedown')) {
			callbacks.mousedown();
		}
	}

	function _mousemove(e) {
		setMouse(e);
		mouse.target = e.target;

		for(let i = 0; i < targets.length; i++) {
			dx = mouse.x - x;
			dy = mouse.y - y;

			if(callbacks[i].hasOwnProperty('mousemove')) {
				callbacks[i].mousemove(dx, dy);
			}

			x = mouse.x;
			y = mouse.y;
		}
	}

	function _mouseup(e) {
		if(down) {
			down = false;

			if(callbacks.hasOwnProperty('mouseup')) {
				callbacks.mouseup();
			}

			targets = [];
			callbacks = [];
		}
	}

	window.draggable = function(element, callbacks) {
		element.addEventListener('mousedown', _mousedown.bind(null, callbacks));
	}

	window.addEventListener('mousemove', _mousemove);
	window.addEventListener('mouseup', _mouseup);
})(); // draggable, mouse

(function() {
	window.direction = function(p1, p2) {
		if(!p2) { p2=p1; p1={x:0,y:0} };
		return Math.atan2(p2.y - p1.y, p2.x - p1.x);
	}

	window.distance = function(p1, p2) {
		return Math.sqrt((p1.x-p2.x)*(p1.x-p2.x) + (p1.y-p2.y)*(p1.y-p2.y));
	}

	window.radToDeg = function(rad) {
		return rad * 180 / Math.PI;
	}
})(); // direction, distance, radToDeg

(function() {
	var count = 0;

	window.id = function() {
		return count++;
	}
})(); // id

(function() {
	window.getClosestDataID = function(element) {
		while(element) {
			if(element.hasAttribute('data-id')) {
				return element.getAttribute('data-id');
			}
			element = element.parentElement;
		}
		return null;
	}
})(); // getClosestDataID

/* --------------------================-------------------- */
/*                        Init Vars                         */
/* --------------------================-------------------- */

let p1, p2;

let entities = {};

let maze;

let MODE = {WALL:0, ZONE: 1}
let mode = MODE.WALL;

let paper, image, handleContainer, wallContainer, commentsContainer;
let pointCounter, wallCounter;
let container = h('div.container', [
	paper = svg('svg.paper', [
		image = svg('image.maze', { href: 'images/maze.png' }),
		wallContainer = svg('g'),
		handleContainer = svg('g'),
	]),
	h('div.info', [
		h('h3', 'stats'),
		h('ul', [
			h('li', 'points: ', pointCounter = h('span', 0)),
			h('li', 'walls: ', wallCounter = h('span', 0)),
		]),
		h('h3', 'controls / hotkeys'),
		h('ul', [
			h('li', 'shift+drag to pan'),
			h('li', 'scroll mousewheel/trackpad to zoom'),
			h('br'), h('br'),
			h('li', h('b', '1: '), ' set first point (hovered point) for line'),
			h('li', h('b', '2: '), ' set second point (hovered point) and create line between first and second point (also, second point becomes new first point)'),
			h('li', h('b', 'q: '), ' create point at mouse pos'),
			h('li', h('b', 'w: '), ' toggle bezier for line (hovered line)'),
			h('li', h('b', 'c: '), ' add comment to hovered point/line'),
			h('li', h('b', 'ctrl+x: '), ' delete line/point/comment at mouse pos (point must have not lines attached)'),
			h('li', h('b', 'ctrl+e: '), ' EXPORT 3D MAZE FILE (hint: you can open it with Blender, it is pretty cool!)'),
			h('li', h('b', 'ctrl+r: '), " Export txt file of points and stuff... (kinda useless unless you're name starts with 'a' and is a palindrome)"),
		]),
		h('h3', 'comments'),
		commentsContainer = h('ul.comments', [
			/*h('li', h('i', 'coming soon (probably)')),
			h('br'), h('br'),
			h('li', 'OK, I imported the maze into Unity and started walking around and I was soooo confused and lost (and that was supposed to be in the "easy" section)... This is gonna be amazing!'),
			h('li', 'Algernon would complete this maze faster than me!'),*/
		]),
	])
]);

let viewBox = {
	x: 0, y: 0,
	scale: 5,
}

let database = firebase.database();

/* --------------------================-------------------- */
/*                        Functions                         */
/* --------------------================-------------------- */

function updateViewBox() {
	paper.setAttribute('viewBox', `
		${viewBox.x/* - paper.width.baseVal.value * viewBox.scale / 4*/},
		${viewBox.y/* - paper.height.baseVal.value * viewBox.scale / 2*/},
		${paper.width.baseVal.value * viewBox.scale},
		${paper.height.baseVal.value * viewBox.scale}
	`);
}

function getEntity(_id) {
	if(entities[_id]) {
		return Promise.resolve(entities[_id]);
	} else {
		return createEntity(_id);
	}
}

function createEntity(_id) {
	return database.ref(`entities/${_id}`).once('value').then(function(snapshot) {
		return new classReference[snapshot.val().type](_id);
	});
}

function getPointAtPercentLength(path, percent) {
	// 
	return path.getPointAtLength(path.getTotalLength() * percent);
}

function getNormalAlongPath(path, percent) {
	let totalLength = path.getTotalLength();
	let dA = totalLength * percent - (percent>=0.5?0.001:0);
	let dB = totalLength * percent + (percent<0.5?0.001:0);
	return direction(
		path.getPointAtLength(dA),
		path.getPointAtLength(dB)
	) - Math.PI / 2;
}

function addVec(pos, mag, dir) {
	return {
		x: pos.x + Math.cos(dir) * mag,
		y: pos.y + Math.sin(dir) * mag
	}
}

function strokeToPoints(path, strokeWidth, angleT, distT, steps) {
	steps = steps || Math.floor(path.getTotalLength());
	strokeWidth = strokeWidth || 1;
	let points = [];
	let lastAngle = Infinity;
	let lastPos = {x: Infinity, y: Infinity};

	angleT = angleT || 0.25;
	distT = distT || 50;

	for(let i = 0; i < steps + 1; i++) {
		let percent = 1 / steps * i;
		let point = getPointAtPercentLength(path, percent);
		let normal = getNormalAlongPath(path, percent);

		if(	Math.abs(lastAngle - normal) > angleT ||
			distance(lastPos, point) > distT || 
			percent >= 1) {
			
			points.push(addVec( point, strokeWidth, normal));
			points.splice(0, 0, addVec( point, strokeWidth, normal + Math.PI ));
			lastAngle = normal;
			lastPos = point;
		}
	};

	return points;
}

function pointsToPath(points) {
	return `${points.map(function(p, i) {
		return `${i===0?'M':'L'}${p.x} ${p.y}`;
	})} Z`
}

function pointsFlipY(points) {
	return points.map(function(p, i) {
		return {x: p.x, y: -p.y};
	});
}

function pointsToShape(points) {
	let shape = new THREE.Shape();
	shape.autoClose = true;
	points.forEach(function(p, i) {
		if(i === 0) {
			shape.moveTo(p.x, p.y);
		} else {
			shape.lineTo(p.x, p.y);
		}
	});
	return shape;
}

function addCounter(c, n) {
	switch(c.constructor) {
		case Handle:
			pointCounter.textContent = Number(pointCounter.textContent) + n;
			break;
		case Wall:
			wallCounter.textContent = Number(wallCounter.textContent) + n;
			break;
	}
}

function setMode(newMode) {
	mode = newMode;
	Object.values(entities).forEach(function(entity) {
		if(entity.constructor === Handle) {
			if(entity.mode === mode) {
				entity.show();
			} else {
				entity.hide();
			}
		}
	});
}

/* --------------------================-------------------- */
/*                           Other                          */
/* --------------------================-------------------- */

class Entity {
	constructor(_id) {
		this.destroyed = false;

		if(_id) {
			this.id = _id;
		} else {
			this.id = database.ref('entities').push({}).key;
		}

		entities[this.id] = this;

		this.ref = database.ref(`entities/${this.id}`);

		this.mode = mode;
		this.comment = null;
	}

	toJSON() {}
	fromJSON() {}

	setComment(text) {
		this.element.classList.add('has-comment');
		this.comment = text;
		if(!this.comment_element) {
			this.comment_element = h('li.comment', {'data-id': this.id}, this.comment);
			commentsContainer.appendChild(this.comment_element);
		} else {
			this.comment_element.textContent = this.comment;
		}
		this.ref.set(this.toJSON());
	}

	removeComment() {
		this.element.classList.remove('has-comment');
		this.comment = null;
		commentsContainer.removeChild(this.comment_element);
		this.ref.set(this.toJSON());
		this.comment_element = null;
	}

	removeReference(inDatabase) {
		if(inDatabase !== false) this.ref.remove();
		if(this.mesh) {
			this.mesh.geometry.dispose();
			maze.scene.remove(this.mesh);
		}
		delete entities[this.id];
	}
}

class Handle extends Entity {
	// ARGS
	// x (number), y (number)
	// OR
	// id (string)
	constructor() { /*++++*/
		if(arguments[0].constructor === Number) {
			super();
		} else {
			super(arguments[0]);
		}

		this.x = 0;
		this.y = 0;

		this._origin = {x: 0, y: 0};

		this.resetOrigin();

		/*~~~*/ this._offset = {x: 0, y: 0}; // rendering offset of handle, does not affect absolute position. Used so that some handles don't overlap important bits you're editing...

		this.callbacks = [];
		this.constraints = [];

		/*~~~*/ this.disabled = false;
		/*~~~*/ this.dragging = false;

		/*~~~*/ this._render();

		if(arguments[0].constructor === Number) {
			this.setPosition(arguments[0], arguments[1], false);
		} else {
			this.update3D();
		}

		this.ref.on('value', function(snapshot) {
			this.fromJSON(snapshot.val());
		}.bind(this));
	}

	toJSON() {
		return {
			type: 'Handle',
			x: this._x,
			y: this._y,
			comment: this.comment,
		}
	}

	fromJSON(o) {
		if(o === null) return;

		this.setPosition(o.x, o.y, true);

		if(o.comment) {
			this.setComment(o.comment)
		} else if(this.comment) {
			this.removeComment();
		};
	}

	// make position of this handle relative to specified parent handle
	parent(handle) { /*++++*/
		let _origin = this._origin;
		this.origin = {
			// absolute origin, no matter how deeply nested
			get x() { return _origin.x + handle.x + handle.origin.x; },
			get y() { return _origin.y + handle.y + handle.origin.y; },
			set x(nx) { return _origin.x = nx },
			set y(ny) { return _origin.y = ny }
		};
		// when position of parent handle changes, update position of this handle
		let callback = function() {
			this.updatePosition(true);
		}.bind(this);
		handle.applyCallback(callback);

		/*~~~*/ this.detachParent = function() {
		/*~~~*/ 	handle.removeCallback(callback);
		/*~~~*/ 	this.resetOrigin();
		/*~~~*/ 	this.updatePosition(true);
		/*~~~*/ }.bind(this);

		// update position of this handle to pick up position of parent
		this.updatePosition(true);
	}

	resetOrigin() { /*++++*/
		let _origin = this._origin;
		this.origin = {
			get x() { return _origin.x },
			get y() { return _origin.y },
			set x(nx) { return _origin.x = nx },
			set y(ny) { return _origin.y = ny }
		};
	}

	detachParent() {}

	// change offset of handle rendering, ONLY affects VISUAL POSITION of handle NOT THE ACTUAL POSITION
	offset(dx, dy) {
		this.setOffset(this._offset.x + dx, this._offset.y + dy);
	}

	setOffset(x, y) {
		this._offset.x = x;
		this._offset.y = y;
		if(this.handle) {
			this.handle._offset = this._offset;
			this.handle.applyTransformations();
		}
		this.applyTransformations(); // update transform of handle with new offset
	}

	// get absolute position of handle
	getAbsolute() { /*++++*/
		return {
			// absolute position, no matter how deeply nested
			x: this.x + this.origin.x,
			y: this.y + this.origin.y
		}
	}

	// check position of this handle relative to another handle
	// this is useful if you want to check the direction between two handles with different parents
	relativeTo(handle) { 
		return {
			// absolute positions, no matter how deeply nested
			x: this.getAbsolute().x - handle.getAbsolute().x,
			y: this.getAbsolute().y - handle.getAbsolute().y
		}
	}

	// add (one or multiple) callback(s) which are called when position of this handle changes
	applyCallback() { /*++++*/
		this.callbacks = this.callbacks.concat([].slice.call(arguments));
	}

	removeCallback() {
		[].slice.call(arguments).forEach(function(fn) {
			this.callbacks.splice(this.callbacks.indexOf(fn), 1);
		}.bind(this));
	}

	// add (one or multple) constraints which can modify the position of this handle when it moves
	applyConstraint() {
		this.constraints = this.constraints.concat([].slice.call(arguments));
		this.updatePosition(); // update position to reflect addition of new constraint(s)
	}

	// remove constraint with same constraint function applied (this works because we call bind on each constraint which creates a unique function)
	removeConstraint() {
		[].slice.call(arguments).forEach(function(fn) {
			this.constraints.remove(fn);
		}.bind(this));
		this.updatePosition(); // update position to reflect removal of constraint
	}

	// apply transforms to this handle
	applyTransformations() {
		// transforms are absolute positions
		let transform = `
			translate(${this.origin.x + this.x + this._offset.x}, ${this.origin.y + this.y + this._offset.y}) 
			rotate(${radToDeg(this.rotation || 0)})
		`;
		this.element.setAttribute('transform', transform);
	}

	// move this handle by (dx, dy), w/ constraints applied of course
	move(dx, dy, doActivateCallbacks) { /*++++*/
		this.setPosition(this._x + dx, this._y + dy, doActivateCallbacks);
	}

	// set position of this handle to (x, y), w/ constraints applied of course
	setPosition(x, y, doActivateCallbacks) { /*++++*/
		this._x = x;
		this._y = y;

		this.updatePosition(doActivateCallbacks)
	}

	// update position of handle and apply constraints
	updatePosition(doActivateCallbacks) { /*++++*/
		// new position before constraints are applied
		let newPos = {x: this._x, y: this._y};

		// apply constraints only if being dragged
		// if(this.dragging) { // BUG: for some reason this doesn't work?
		this.constraints.forEach(function(fn) {
			newPos = fn(newPos); // each constraint modifies position
		});
		// }

		// set position to constraint-modified position
		this.x = newPos.x;
		this.y = newPos.y;

		// there are some cases in which we don't want to update callbacks when we update position
		// when exported, we always want callbacks right? anyway it doesn't matter
		/*~~~*/ if(doActivateCallbacks) {
			this.activateCallbacks();
		/*~~~*/ }

		// apply transformations so that we can see changes
		/*~~~*/ this.applyTransformations();

		// update database
		this.ref.set(this.toJSON());

		// update 3D
		//this.update3D();
	}

	update3D() {
		if(!this.mesh) {
			var geometry = new THREE.CylinderGeometry( 2, 2, 10, 16 );
			var material = new THREE.MeshBasicMaterial( {color: 0xff0099} );
			this.mesh = new THREE.Mesh( geometry, material );
			maze.scene.add( this.mesh );
		}

		this.mesh.position.x = this.x;
		this.mesh.position.y = -this.y;
	}

	// activate all callbacks, passing this handle as an argument
	activateCallbacks() { /*++++*/
		this.callbacks.forEach(function(callback) {
			callback(this);
		}.bind(this));
	}

	// show this handle
	show() {
		if(this.disabled) return; // do not show if disabled

		this.element.classList.remove('hidden');
		if(this.handle) this.handle.show(); // show rotation handle if exists
	}

	// hide this handle
	hide() {
		this.element.classList.add('hidden');
		if(this.handle) this.handle.hide(); // hide rotation handle if exists
	}

	// disable this handle, does not allow it to be shown
	disable() {
		this.disabled = true;
		if(this.handle) this.handle.disable(); // disable rotation handle if exists
		this.hide(); // hide handle, will not unhide until handle is enabled again
	}

	// enable this handle, allowing it to show/hide normally
	enable() {
		this.disabled = false;
		if(this.handle) this.handle.enable(); // enable rotation handle if exists
		this.show(); // show handle, now acts normally
	}

	_render() {
		this.element = svg('g.handle', { 'data-id': this.id }, [
			svg('circle', {
				cx: 0, cy: 0, r: 2,
			}),
		]);

		// make this handle draggable
		draggable(this.element, {
			mousedown: function() {
				this.dragging = true;
			}.bind(this),
			mousemove: function(dx, dy) {
				this.move(dx, dy, true);
			}.bind(this),
			mouseup: function() {
				this.setPosition(this.x, this.y);
				this.dragging = false;
				// save();
			}.bind(this)
		});

		handleContainer.appendChild(this.element);
	}

	// destroy this handle
	destroy() {
		if(!this.destroyed) {
			this.element.parentElement.removeChild(this.element); // remove handle from it's parent
			this.removeReference();

			this.destroyed = true;
		}	
	}
}

class Wall extends Entity {
	// ARGS:
	// point A (handle), point B (handle)
	// OR
	// id (string)
	constructor() {
		if(arguments[0].constructor === Handle) {
			super();

			this.pA = arguments[0];
			this.pB = arguments[1];

			this.applyCallbacks();


			this.ref.set(this.toJSON());
		} else {
			super(arguments[0]);
		}
		
		this.bezierHandle = null; // quadratic bezier

		this._render();

		if(arguments[0].constructor === Handle) {
			this.updatePath();
		}

		this.ref.on('value', function(snapshot) {
			this.fromJSON(snapshot.val());
		}.bind(this));
	}

	toJSON() {
		return {
			type: 'Wall',
			mode: this.mode,
			comment: this.comment,
			pA_id: this.pA.id,
			pB_id: this.pB.id,
			bezierHandle_id: (this.bezierHandle 
				? this.bezierHandle.id
				: null),
		};
	}

	fromJSON(o) {
		let pr = Promise.resolve();
		if(o === null) return;

		if(o.mode) this.mode = o.mode;
		
		if(!this.pA && !this.pB) {

			// use async await?

			pr.then(
				getEntity(o.pA_id)
					.then(function(handle) {
						this.pA = handle;
					}.bind(this))
			);

			pr.then(
				getEntity(o.pB_id)
					.then(function(handle) {
						this.pB = handle;
					}.bind(this))
			);
			
			pr.then(function() {
				this.applyCallbacks();
				this.updatePath();

				if(o.comment) {
					this.setComment(o.comment)
				} else if(this.comment) {
					this.removeComment();
				};
			}.bind(this));
		}
		if(!this.bezierHandle && o.bezierHandle_id) {
			pr.then(
				getEntity(o.bezierHandle_id)
					.then(function(handle) {
						this.setBezierHandle(handle);
					}.bind(this))
			);
		};
	}

	getPoints() {
		if(this.bezierHandle) {
			return strokeToPoints(this.path, 2);
		} else {
			return strokeToPoints(this.path, 2, null, Infinity, 2);
		}
	}

	get3DGeometry() {
		let shape = pointsToShape(pointsFlipY(this.getPoints()));

		let extrudeSettings = { 
			steps: 1, 
			amount: 20, 
			bevelEnabled: false
		};
		return new THREE.ExtrudeGeometry( shape, extrudeSettings );
	}

	update3D() {
		let geometry = this.get3DGeometry();

		if(this.mesh) {
			this.mesh.geometry.dispose();
			this.mesh.geometry = geometry;
			return;
		};

		let material = new THREE.MeshBasicMaterial( {color: 0xffffff } );
		this.mesh = new THREE.Mesh( geometry, material );

		maze.scene.add( this.mesh );
	}

	removeCallbacks() {}
	applyCallbacks() {
		let pA_c = this.updatePath.bind(this);
		let pB_c = this.updatePath.bind(this);
		this.pA.applyCallback(pA_c);
		this.pB.applyCallback(pB_c);

		this.removeCallbacks = function() {
			this.pA.removeCallback(pA_c);
			this.pB.removeCallback(pB_c);
		}
	}

	updatePath () {
		this.path.setAttribute('d', `
			M ${this.pA.x} ${this.pA.y}
			${this.bezierHandle ? `Q
				${this.bezierHandle ? this.bezierHandle.x : 0}
				${this.bezierHandle ? this.bezierHandle.y : 0}
			` : 'L'}
			${this.pB.x} ${this.pB.y}
		`);

		this.element.setAttribute('d', pointsToPath(this.getPoints()));
	
		this.update3D();
	}

	setBezierHandle(handle) {
		this.bezierHandle = handle;
		this.bezierHandle.element.classList.add('bezier-handle');
		this.bezierHandle.element.removeAttribute('data-id');
		this.bezierHandle.removeReference(false);

		this.bezierHandle.applyCallback(this.updatePath.bind(this));

		this.updatePath();
	}

	toggleBezierHandle() {
		if(!this.bezierHandle) {
			let midX = (this.pA.x + this.pB.x) / 2;
			let midY = (this.pA.y + this.pB.y) / 2;

			this.setBezierHandle(new Handle(midX, midY));
		} else {
			this.bezierHandle.destroy();
			this.bezierHandle = null;
		}

		this.ref.set(this.toJSON());
	}

	_render() {
		this.path = svg('path');
		this.element = svg(`path.wall`, { 'data-id': this.id });

		wallContainer.appendChild(this.element);
	}

	destroy() {
		if(!this.destroyed) {
			this.element.parentElement.removeChild(this.element);
			if(this.bezierHandle) this.bezierHandle.destroy();
			this.removeCallbacks();
			this.removeReference();
		}

		// maze.scene.remove(this.mesh);
	}
}

class Maze3D {
	constructor() {
		this.initThreeJS();

		this.update();
	}

	initThreeJS() {
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 75, 450 / 300, 0.1, 2000 );
	
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize( 900, 600 );

		this.renderer.domElement.style.width = '450px';
		this.renderer.domElement.style.height = '300px';


		image.addEventListener('load', function() {
			let scale = 0.4;
			this.scene.position.x = -image.getBBox().width / 2 * scale;
			this.scene.position.z = image.getBBox().width / 2 * scale;
			// this.scene.position.y = image.getBBox().height / 2 * scale;
			this.scene.scale.x = this.scene.scale.y = this.scene.scale.z = scale;
			this.scene.rotation.x = Math.PI / 2;
		}.bind(this));
		

		//this.camera.position.x = 950;
		// this.camera.position.y = -900;
		// this.camera.position.z = 500;
		this.camera.rotation.x = Math.PI / 2;
		this.camera.position.y = -500;
	}

	saveAsObj() {
		let exporter = new THREE.OBJExporter();
		let objscene = exporter.parse(this.scene);

		let blob = new Blob([objscene], {'type': 'text/plain'});
		saveAs(blob, "maze.obj");
	}

	saveAsPoints() {
		let allpoints = Object.values(entities).filter(function(entity) {
			if(entity.constructor === Handle && entity.callbacks.length > 0) {
				return false;
			} else {
				return true;
			}
		}).map(function(entity) {
			function fixPoint(p) {
				let scale = 0.4;
				return {
					x: 	-( /* flip horizontally */
						(p.x - image.getBBox().width / 2) /* center maze */
						* scale) /* scale maze */
						.toFixed(1) /* round to closest tenth (converts to string)*/, 
					y: 	((p.y - image.getBBox().height / 2) /* center maze */
						* scale) /* scale maze */
						.toFixed(1) /* round to closest tenth (converts to string)*/
				}
			}
			if(entity.constructor === Wall) {
				return `W ${entity.getPoints().map(function(point) {
					let p = fixPoint(point);
					return `${p.x},${p.y}`;
				}).join('|')}`;
			} else if(entity.constructor === Handle) {
				// if(entity.callbacks.length === 0) {
				let p = fixPoint(entity);
				return `P ${p.x},${p.y}`;
				// }
			}
		}).join('\n');


		let blob = new Blob([allpoints], {'type': 'text/plain'});
		saveAs(blob, "maze_points.txt");
	}

	update() {
		requestAnimationFrame( this.update.bind(this) );

		this.renderer.render( this.scene, this.camera );
	}
}

let classReference = { Entity, Handle, Wall, Maze3D };

/* --------------------================-------------------- */
/*                         Hotkeys                          */
/* --------------------================-------------------- */

hotkeys('q', function(event, handler) {
	new Handle(mouse.x, mouse.y);
}); // create point

hotkeys('w, c', function(event, handler) {
	let _id = getClosestDataID(mouse.target);
	let w = entities[_id];
	switch(handler.key) {
		case 'w':
			if(w.constructor === Wall) {
				w.toggleBezierHandle();
			}
			break;
		case 'c':
			let comment = prompt("Please enter your comment");
			if(comment) {
				w.setComment(comment);
			}
			break;
	}
	
}); // turn line into bezier, comment

hotkeys('1, 2', function(event, handler) {
	let _id = getClosestDataID(mouse.target);
	let p = entities[_id];
	if(p.constructor === Handle) {
		switch(handler.key) {
			case '2': 
				p2 = p;
				if(p1 && p1 !== p2) new Wall(p1, p2);
				p2 = null;
			case '1':
				p1 = p;
		}
	}
}); // point 1, point 2

hotkeys('9, 0', function(event, handler) {
	switch(handler.key) {
		case '9': setMode(MODE.WALL); break;
		case '0': setMode(MODE.ZONE); break
	}
})

hotkeys('ctrl+x', function(event, handler) {
	let _id = getClosestDataID(mouse.target);
	let entity = entities[_id];
	if(entity) {
		if(mouse.target.classList.contains('comment')) {
			entity.removeComment();
			return;
		}
		if(entity.callbacks && entity.callbacks.length > 0) {
			return;
		}
		entity.destroy();
	}
}); // destroy entity/comment

hotkeys('ctrl+e', function(event, handler) {
	maze.saveAsObj();
}); // export 3D

hotkeys('ctrl+r', function(event, handler) {
	maze.saveAsPoints();
}); // export text

/* --------------------================-------------------- */
/*                          Events                          */
/* --------------------================-------------------- */

// zoom + pan
paper.addEventListener('mousewheel', function(e) {
	// prevent default zoom / scroll events
	e.preventDefault();
	e.stopPropagation();
	// mousewheel event w/ e.ctrlKey in Chrome is actually pinch-zoom
	/*if(e.ctrlKey) { // zoom
		viewBox.scale += e.deltaY * viewBox.scale / 100;
		viewBox.scale = Math.min(Math.max(viewBox.scale, 0.1), 10);
	}else{ // pan
		viewBox.x += e.deltaX * viewBox.scale; // multiply by scale to always pan at same rate
		viewBox.y += e.deltaY * viewBox.scale;
	}
	updateViewBox();	

	console.log(e);*/

	viewBox.scale += e.deltaY * viewBox.scale / 300;
	viewBox.scale = Math.min(Math.max(viewBox.scale, 0.1), 10);

	updateViewBox();	
});

// resize viewBox whenever screen resizes, keeps SVG same size
window.addEventListener('resize', updateViewBox);
window.addEventListener('load', updateViewBox);

draggable(paper, {
	mousemove: function(dx, dy) {
		if(mouse.shiftKey) {
			viewBox.x = Math.round(viewBox.x - dx * 0.6);
			viewBox.y = Math.round(viewBox.y - dy * 0.6);

			updateViewBox();
		}
	}
});


/* --------------------================-------------------- */
/*                        Initialize                        */
/* --------------------================-------------------- */

maze = new Maze3D();

// container.appendChild(maze.renderer.domElement);

// add entities from database

database.ref('entities').on('child_added', function(snapshot) {
	getEntity(snapshot.key).then(function(entity) {
		addCounter( entity, 1 );
	});
});

database.ref('entities').on('child_removed', function(snapshot) {
		

	if(entities[snapshot.key]) {
		addCounter(entities[snapshot.key], -1);
		entities[snapshot.key].destroy();
	}
});

// add elements to document
document.body.appendChild(container);

updateViewBox();

/* --------------------================-------------------- */
/*                            Fin                           */
/* --------------------================-------------------- */


