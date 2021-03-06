/**
 * This file is a part of MediaCore, Copyright 2010 Simple Station Inc.
 *
 * MediaCore is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * MediaCore is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

goog.provide('mcore.players.Controller');

goog.require('goog.array');
goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.dom.ViewportSizeMonitor');
goog.require('goog.dom.classes');
goog.require('goog.events');
goog.require('goog.net.cookies');
goog.require('goog.ui.Component');
goog.require('mcore.players.ColumnViewResizer');
goog.require('mcore.players.Rater');
goog.require('mcore.players.WideViewResizer');
goog.require('mcore.popups.SimplePopup');



/**
 * Manages the behaviour of the overall player box and control bar.
 *
 * @param {goog.ui.Component} player The player handler.
 * @param {goog.dom.DomHelper=} opt_domHelper Optional DOM helper, used for
 *     document interaction.
 * @constructor
 * @extends {goog.ui.Component}
 */
mcore.players.Controller = function(player, opt_domHelper) {
  goog.base(this, opt_domHelper);

  /**
   * Player Handler.
   * @type {goog.ui.Component}
   * @private
   */
  this.player_ = player;
};
goog.inherits(mcore.players.Controller, goog.ui.Component);


/**
 * The cookie name to store the user's preference for regular or the
 * expanded size of the player.
 * @type {string}
 */
mcore.players.Controller.SIZE_COOKIE_NAME = 'mcore-wide';


/**
 * A list of functions, each of which performing the call to
 * controller.decorate() for a unique controller.
 * @type{Array.<function()>}
 */
mcore.players.Controller.decorateQueue_ = [];


/**
 * Flag that indicates whether the page is loaded and the pageLoaded function
 * has been called.
 * @type {boolean}
 */
mcore.players.Controller.pageLoaded_ = false;


/**
 * Popup instances for download, embed, share, etc.
 * @type {Array.<mcore.popups.SimplePopup>|undefined}
 * @private
 */
mcore.players.Controller.prototype.popups_;


/**
 * The handler for expanding and shrinking the player on the page.
 * @type {mcore.players.ResizerBase|undefined}
 * @private
 */
mcore.players.Controller.prototype.resizer_;


/**
 * The button for expanding and shrinking the player on the page.
 * @type {Element|undefined}
 * @private
 */
mcore.players.Controller.prototype.resizerBtn_;


/**
 * The button for liking the given media.
 * @type {Element|undefined}
 * @private
 */
mcore.players.Controller.prototype.likeBtn_;


/**
 * The button for disliking the given media.
 * @type {Element|undefined}
 * @private
 */
mcore.players.Controller.prototype.dislikeBtn_;


/**
 * Flag that indicates whether the player is resizing to fit the viewport.
 * @type {boolean}
 * @private
 */
mcore.players.Controller.prototype.isFillScreen_ = false;


/**
 * Inspect the DOM and initialize all the controls that are present.
 * @inheritDoc
 */
mcore.players.Controller.prototype.decorateInternal = function(element) {
  goog.base(this, 'decorateInternal', element);

  var box = this.dom_.getElementsByClass('mcore-playerbox', element)[0];
  var bar = this.dom_.getElementsByClass('mcore-playerbar', element)[0];
  var extras = this.dom_.getElementsByClass('meta-hover', bar);
  var popout = this.dom_.getElementsByClass('mcore-popout', bar)[0];
  this.resizerBtn_ = this.dom_.getElementsByClass('mcore-resizer', bar)[0];
  this.likeBtn_ = this.dom_.getElementsByClass('mcore-like', bar)[0];
  this.dislikeBtn_ = this.dom_.getElementsByClass('mcore-dislike', bar)[0];

  this.addChild(this.player_, /* opt_render */ false);
  this.player_.decorate(box);

  this.popups_ = goog.array.map(extras, this.decorateInternalPopup, this);

  if (this.resizerBtn_) {
    if (this.getResizer()) {
      this.getHandler().listen(this.resizerBtn_, goog.events.EventType.CLICK,
          this.handleResize);
    } else {
      // remove the resize button if we can't find a resizing solution
      this.dom_.removeNode(this.resizerBtn_.parentNode);
      delete this.resizerBtn_;
    }
  }

  if (popout) {
    this.getHandler().listen(popout, goog.events.EventType.CLICK,
        this.handlePopout);
  }

  if (this.likeBtn_) {
    this.getHandler().listen(this.likeBtn_, goog.events.EventType.CLICK,
        this.handleLike);
  }

  if (this.dislikeBtn_) {
    this.getHandler().listen(this.dislikeBtn_, goog.events.EventType.CLICK,
        this.handleDislike);
  }
};


/**
 * Resize the player if setFillScreen(true) was enabled before decoration.
 * @inheritDoc
 */
mcore.players.Controller.prototype.enterDocument = function() {
  if (this.isFillScreen_) {
    this.player_.setSize(this.dom_.getViewportSize());
  } else {
    var sizePreference = goog.net.cookies.get(
        mcore.players.Controller.SIZE_COOKIE_NAME);
    if (goog.isDef(sizePreference)) {
      this.getResizer().setExpanded(Number(sizePreference));
      this.refreshResizeButton();
    }
  }
};


/**
 * Decorate popup elements with a popup handler.
 * @param {Element} elem Popup content.
 * @return {mcore.popups.SimplePopup} A popup instance.
 * @protected
 */
mcore.players.Controller.prototype.decorateInternalPopup = function(elem) {
  var popupButton = this.dom_.getPreviousElementSibling(elem);
  var popup = new mcore.popups.SimplePopup(elem);
  popup.setVisible(false);
  popup.attach(popupButton);
  return popup;
};


/**
 * Open a slimmed down window that contains just the player.
 * @param {goog.events.BrowserEvent} e Click event.
 * @protected
 */
mcore.players.Controller.prototype.handlePopout = function(e) {
  e.preventDefault();
  var target = this.dom_.getAncestorByTagNameAndClass(e.target,
      goog.dom.TagName.A);
  var size = goog.style.getSize(this.player_.getContentElement());
  var windowOpts = 'menubar=no,location=yes,resizable=yes,scrollbars=no,' +
      'status=no,width=' + size.width + ',height=' + size.height;
  window.open(target, this.getElement().id, windowOpts);
};


/**
 * Expand or shrink the player size.
 * @param {goog.events.BrowserEvent} e Click event.
 * @protected
 */
mcore.players.Controller.prototype.handleResize = function(e) {
  var resizer = this.getResizer();
  resizer.toggleExpanded();
  var isExpanded = resizer.isExpanded();
  goog.net.cookies.set(mcore.players.Controller.SIZE_COOKIE_NAME,
                       isExpanded ? '1' : '0');
  this.refreshResizeButton();
};


/**
 * @protected
 */
mcore.players.Controller.prototype.refreshResizeButton = function() {
  if (this.resizerBtn_) {
    // TODO: Update the title/inner text and simplify the icon change
    var icon = this.dom_.getFirstElementChild(
        this.dom_.getFirstElementChild(this.resizerBtn_));
    if (icon) {
      var isExpanded = this.getResizer().isExpanded();
      goog.dom.classes.enable(icon, 'mcore-btn-expand', !isExpanded);
      goog.dom.classes.enable(icon, 'mcore-btn-shrink', isExpanded);
    }
  }
};


/**
 * Log that the user likes this media.
 * @param {goog.events.BrowserEvent} e Click event.
 * @protected
 */
mcore.players.Controller.prototype.handleLike = function(e) {
  e.preventDefault();
  var target = this.dom_.getAncestorByTagNameAndClass(e.target,
      goog.dom.TagName.A);
  this.getRater().like(target.href);
  this.disableLikeDislikeButtons();
};


/**
 * Log that the user likes this media.
 * @param {goog.events.BrowserEvent} e Click event.
 * @protected
 */
mcore.players.Controller.prototype.handleDislike = function(e) {
  e.preventDefault();
  var target = this.dom_.getAncestorByTagNameAndClass(e.target,
      goog.dom.TagName.A);
  this.getRater().dislike(target.href);
  this.disableLikeDislikeButtons();
};


/**
 * Replace the Like and Dislike <a> elements with an identical <div> elements.
 * The class name and child nodes are adopted without modification.
 */
mcore.players.Controller.prototype.disableLikeDislikeButtons = function() {
  goog.array.forEach([this.likeBtn_, this.dislikeBtn_], function(anchor) {
    if (anchor) {
      // Attempt to grey out the button icon and text
      var iconElem = this.dom_.getFirstElementChild(anchor);
      iconElem = iconElem ? this.dom_.getFirstElementChild(iconElem) : null;
      if (iconElem) {
        goog.style.setOpacity(iconElem, 0.5);
      }
      var div = this.dom_.createDom(goog.dom.TagName.DIV, anchor.className,
          anchor.childNodes);
      this.dom_.replaceNode(div, anchor);
      return div;
    }
  }, this);
  delete this.likeBtn_;
  delete this.dislikeBtn_;
};


/**
 * @return {mcore.players.Rater} A lazy-loaded liker/disliker instance.
 */
mcore.players.Controller.prototype.getRater = function() {
  return this.rater_ || (this.rater_ = new mcore.players.Rater(this.dom_));
};


/**
 * Set your own custom rater if you've dramatically altered the layout
 * of the media view page, and ours doesn't work for you.
 * @param {mcore.players.Rater} rater A sublcass with your play() method.
 * @return {mcore.players.Controller} The controller instance for chaining.
 */
mcore.players.Controller.prototype.setRater = function(rater) {
  this.rater_ = rater;
  return this;
};


/**
 * Return a resizer if one has been set manually or can be determined
 * automatically from the Dom of the page. See ResizerBase for more info.
 * @return {?mcore.players.ResizerBase} A lazy-loaded resizer instance.
 */
mcore.players.Controller.prototype.getResizer = function() {
  if (!goog.isDef(this.resizer_)) {
    this.resizer_ = this.getDefaultResizer();
  }
  return this.resizer_;
};


/**
 * Make a guess as to what resizer class to use based on the classes
 * associated with the container element we use on the media view page.
 * This logic can be bypassed by manually setting the resizer prior
 * to decoration.
 * @return {?mcore.players.ResizerBase} A new resizer instance
 *     suited for this page's Dom.
 */
mcore.players.Controller.prototype.getDefaultResizer = function() {
  var container = this.dom_.getElement('media-box');
  var classes = container ? goog.dom.classes.get(container) : [];
  if (goog.array.contains(classes, 'media-norm')) {
    return new mcore.players.ColumnViewResizer(this.player_);
  } else if (goog.array.contains(classes, 'media-wide')) {
    return new mcore.players.WideViewResizer(this.player_);
  }
  return null;
};


/**
 * Set your own custom resizer if you've dramatically altered the layout
 * of the media view page, and ours doesn't work for you.
 * @param {!mcore.players.ResizerBase} resizer A ResizerBase subclass.
 * @return {mcore.players.Controller} The controller instance of chaining.
 */
mcore.players.Controller.prototype.setResizer = function(resizer) {
  this.resizer_ = resizer;
  return this;
};


/**
 * Ensure the player will always fill the viewport.
 *
 * If this is called prior to {@code decorate()} we delay resizing the
 * player until decoration actually occurs (see {@code enterDocument()}).
 * After decoration is complete, enabling this will resize immediately.
 *
 * @param {boolean} enabled True to enable, False to disable screen filling.
 * @return {mcore.players.Controller} The controller instance for chaining.
 */
mcore.players.Controller.prototype.setFillScreen = function(enabled) {
  var vsm = goog.dom.ViewportSizeMonitor.getInstanceForWindow(
      this.dom_.getWindow());

  if (this.isFillScreen_ = !!enabled) {
    if (this.isInDocument()) {
      this.player_.setSize(this.dom_.getViewportSize());
    }
    this.getHandler().listen(vsm, goog.events.EventType.RESIZE,
        this.handleViewportResize);
  } else {
    this.getHandler().unlisten(vsm, goog.events.EventType.RESIZE,
        this.handleViewportResize);
  }
  return this;
};


/**
 * Resize the player when the viewport size changes.
 * This event is only attached when setFillScreen(true) has been called.
 * @param {goog.events.Event} e Resize event.
 * @protected
 */
mcore.players.Controller.prototype.handleViewportResize = function(e) {
  var vsm = /** @type {goog.dom.ViewportSizeMonitor} */ (e.target);
  var size = vsm.getSize();
  this.player_.setSize(size);
};


/**
 * @return {goog.ui.Component} Retrieve the player instance.
 */
mcore.players.Controller.prototype.getPlayer = function() {
  return this.player_;
};


/** @inheritDoc */
mcore.players.Controller.prototype.disposeInternal = function() {
  goog.base(this, 'disposeInternal');
  for (var i = 0; i < this.popups_.length; ++i) {
    this.popups_[i].dispose();
    delete this.popups_[i];
  }
  goog.dispose(this.resizer_);
  goog.dispose(this.rater_);
  this.popups_ = undefined;
  this.resizer_ = undefined;
  this.resizerBtn_ = undefined;
  delete this.player_;
};


/**
 * Initialize a controller for the given player.
 * @param {Element} element The container element for the player + controlbar.
 * @param {goog.ui.Component} player A player implementation.
 * @param {function(mcore.players.Controller)=} opt_callback Optional callback
 *     to allow customization of the newly initialized controller before any
 *     action is taken.
 * @return {mcore.players.Controller} The new controller instance.
 */
mcore.players.Controller.init = function(element, player, opt_callback) {
  element = goog.dom.getElement(element);
  var controller = new mcore.players.Controller(player);
  if (opt_callback) { opt_callback(controller); }
  var decorateJob = function() {
    var decorate = function() {
      controller.decorate(element);
    }
    // Add a delay before the controller decorates the page in order to give
    // the UI thread an opportunity to take action elsewhere, reducing the
    // perceived latency of this process.
    var delay = 25;
    setTimeout(decorate, delay);
  }

  if (mcore.players.Controller.pageLoaded_) {
    // if the page is loaded, execute the job immediately
    decorateJob();
  } else {
    // otherwise queue the job until the appropriate DOM elements are ready.
    mcore.players.Controller.decorateQueue_.push(decorateJob);
  }

  return controller;
};


/**
 * Perform all queued decoration jobs.
 * Call this after the entire 'media-box' DOM tree has been loaded.
 */
mcore.players.Controller.pageLoaded = function() {
  // Do not execute more than once.
  if (mcore.players.Controller.pageLoaded_) { return; }

  var queue = mcore.players.Controller.decorateQueue_
  for (var i=0; i<queue.length; i++) {
    var decorateJob = queue[i];
    decorateJob();
  }
  mcore.players.Controller.decorateQueue_ = [];
  mcore.players.Controller.pageLoaded_ = true;
}

goog.exportSymbol('mcore.initPlayerController', mcore.players.Controller.init);
goog.exportSymbol('mcore.PlayerController', mcore.players.Controller);
goog.exportSymbol('mcore.PlayerController.prototype.setFillScreen',
    mcore.players.Controller.prototype.setFillScreen);
goog.exportSymbol('mcore.PlayerController.prototype.setResizer',
    mcore.players.Controller.prototype.setResizer);
goog.exportSymbol('mcore.PlayerController.prototype.getPlayer',
    mcore.players.Controller.prototype.getPlayer);
