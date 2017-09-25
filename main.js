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
	let target, callbacks;
	let down, x, y, dx, dy;

	window.mouse = {x: 100, y: 100, target: null};

	function setMouse(e) {
		mouse.x = e.clientX * viewBox.scale + viewBox.x;
		mouse.y = e.clientY * viewBox.scale + viewBox.y;
	}

	function _mousedown(fns, e) {
		target = e.target;
		callbacks = fns;

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

		if(down) {
			dx = mouse.x - x;
			dy = mouse.y - y;

			if(callbacks.hasOwnProperty('mousemove')) {
				callbacks.mousemove(dx, dy);
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

let paper, handleContainer, wallContainer;
let container = h('div', [
	paper = svg('svg.paper', [
		svg('image.maze', { href: 'images/maze.png' }),
		wallContainer = svg('g'),
		handleContainer = svg('g'),
	]),
]);

let viewBox = {
	x: 0, y: 0,
	scale: 2.5,
}

let database = firebase.database();

/* --------------------================-------------------- */
/*                        Functions                         */
/* --------------------================-------------------- */

function updateViewBox() {
	paper.setAttribute('viewBox', `
		${viewBox.x/* - paper.width.baseVal.value * viewBox.scale / 2*/},
		${viewBox.y/* - paper.height.baseVal.value * viewBox.scale / 2*/},
		${paper.width.baseVal.value * viewBox.scale},
		${paper.height.baseVal.value * viewBox.scale}
	`);
}

/* --------------------================-------------------- */
/*                           Other                          */
/* --------------------================-------------------- */

class Entity {
	constructor() {
		this.id = id();
		entities[this.id] = this;
	}

	removeReference() {
		delete entities[this.id];
	}
}

class Handle extends Entity {
	constructor(x, y) { /*++++*/
		super();

		this.x = x;
		this.y = y;

		this._x = x; // actual x position before constraints are applied
		this._y = y; // actual y position before constraints are applied

		this._origin = {x: 0, y: 0};

		this.resetOrigin();

		/*~~~*/ this._offset = {x: 0, y: 0}; // rendering offset of handle, does not affect absolute position. Used so that some handles don't overlap important bits you're editing...

		this.callbacks = [];
		this.constraints = [];

		/*~~~*/ this.disabled = false;
		/*~~~*/ this.dragging = false;

		/*~~~*/ this._render();
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

	removeCallback(c) {
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
		this.updatePosition();

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
		this.element.parentElement.removeChild(this.element); // remove handle from it's parent
		this.removeReference();	
	}
}

class Wall extends Entity {
	constructor(pA, pB) {
		super();

		this.pA = pA;
		this.pB = pB;
		this.bezierHandle = null; // quadratic bezier

		this._render();

		this.pA.applyCallback(this.updatePath.bind(this));
		this.pB.applyCallback(this.updatePath.bind(this));

		this.updatePath();
	}

	updatePath () {
		this.element.setAttribute('d', `
			M ${this.pA.x} ${this.pA.y}
			${this.bezierHandle ? `Q
				${this.bezierHandle ? this.bezierHandle.x : 0}
				${this.bezierHandle ? this.bezierHandle.y : 0}
			` : 'L'}
			${this.pB.x} ${this.pB.y}
		`);
	}

	toggleBezierHandle() {
		if(!this.bezierHandle) {
			let midX = (this.pA.x + this.pB.x) / 2;
			let midY = (this.pA.y + this.pB.y) / 2;

			this.bezierHandle = new Handle(midX, midY);
			this.bezierHandle.element.classList.add('bezier-handle');

			this.bezierHandle.applyCallback(this.updatePath.bind(this));
		} else {
			this.bezierHandle.destroy();
			this.bezierHandle = null;
		}
	}

	_render() {
		this.element = svg(`path.wall`, { 'data-id': this.id });

		wallContainer.appendChild(this.element);
	}

	destroy() {
		this.element.parentElement.removeChild(this.element);
		this.removeReference();
	}
}

class Maze3D {
	constructor() {
		this.initThreeJS();

		this.update();
	}

	initThreeJS() {
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 75, 450 / 300, 0.1, 1000 );
	
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize( 450, 300 );

		/*var shape = new THREE.Shape();
		shape.moveTo( 0, 0 );
		var numSteps = 10, stepSize = 10;

		for ( var i = 0; i < numSteps; i ++ ) {

		    shape.lineTo( i * stepSize, ( i + 1 ) * stepSize );
		    shape.lineTo( ( i + 1 ) * stepSize, ( i + 1 ) * stepSize );

		}

		var extrudeSettings = { amount: 2, bevelEnabled: false };
		var geometry = new THREE.ExtrudeGeometry( shape, extrudeSettings );

		var material = new THREE.MeshBasicMaterial( {color: 0xffffff } );
		var steps = new THREE.Mesh( geometry, material );

		this.scene.add( steps );
		this.camera.position.z = 100;*/
	}

	update() {
		requestAnimationFrame( this.update.bind(this) );
		this.renderer.render( this.scene, this.camera );
	}
}

/* --------------------================-------------------- */
/*                         Hotkeys                          */
/* --------------------================-------------------- */

hotkeys('ctrl+q', function(event, handler) {
	new Handle(mouse.x, mouse.y);
});

hotkeys('ctrl+w', function(event, handler) {
	let _id = getClosestDataID(mouse.target);
	let w = entities[_id];
	if(w.constructor === Wall) {
		w.toggleBezierHandle();
	}
});

hotkeys('ctrl+1, ctrl+2', function(event, handler) {
	let _id = getClosestDataID(mouse.target);
	let p = entities[_id];
	if(p.constructor === Handle) {
		switch(handler.key) {
			case 'ctrl+2': 
				p2 = p;
				if(p1 && p1 !== p2) new Wall(p1, p2);
				p2 = null;
			case 'ctrl+1':
				p1 = p;
		}
	}
});

hotkeys('ctrl+x', function(event, handler) {
	let _id = getClosestDataID(mouse.target);
	let entity = entities[_id];
	if(entity) entity.destroy();
})

/* --------------------================-------------------- */
/*                          Events                          */
/* --------------------================-------------------- */

// zoom + pan
paper.addEventListener('mousewheel', function(e) {
	// prevent default zoom / scroll events
	e.preventDefault();
	e.stopPropagation();
	// mousewheel event w/ e.ctrlKey in Chrome is actually pinch-zoom
	if(e.ctrlKey) { // zoom
		viewBox.scale += e.deltaY * viewBox.scale / 100;
		viewBox.scale = Math.min(Math.max(viewBox.scale, 0.1), 3);
	}else{ // pan
		viewBox.x += e.deltaX * viewBox.scale; // multiply by scale to always pan at same rate
		viewBox.y += e.deltaY * viewBox.scale;
	}
	updateViewBox();	
});

// resize viewBox whenever screen resizes, keeps SVG same size
window.addEventListener('resize', updateViewBox);
window.addEventListener('load', updateViewBox);


/* --------------------================-------------------- */
/*                        Initialize                        */
/* --------------------================-------------------- */

maze = new Maze3D();

container.appendChild(maze.renderer.domElement);

// add elements to document
document.body.appendChild(container);

/* --------------------================-------------------- */
/*                            Fin                           */
/* --------------------================-------------------- */


