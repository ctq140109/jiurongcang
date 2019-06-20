;(function () {
    'use strict';

    /**
     * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
     *
     * @codingstandard ftlabs-jsv2
     * @copyright The Financial Times Limited [All Rights Reserved]
     * @license MIT License (see LICENSE.txt)
     */

    /*jslint browser:true, node:true*/
    /*global define, Event, Node*/


    /**
     * Instantiate fast-clicking listeners on the specified layer.
     *
     * @constructor
     * @param {Element} layer The layer to listen on
     * @param {Object} [options={}] The options to override the defaults
     */
    function FastClick(layer, options) {
        var oldOnClick;

        options = options || {};

        /**
         * Whether a click is currently being tracked.
         *
         * @type boolean
         */
        this.trackingClick = false;


        /**
         * Timestamp for when click tracking started.
         *
         * @type number
         */
        this.trackingClickStart = 0;


        /**
         * The element being tracked for a click.
         *
         * @type EventTarget
         */
        this.targetElement = null;


        /**
         * X-coordinate of touch start event.
         *
         * @type number
         */
        this.touchStartX = 0;


        /**
         * Y-coordinate of touch start event.
         *
         * @type number
         */
        this.touchStartY = 0;


        /**
         * ID of the last touch, retrieved from Touch.identifier.
         *
         * @type number
         */
        this.lastTouchIdentifier = 0;


        /**
         * Touchmove boundary, beyond which a click will be cancelled.
         *
         * @type number
         */
        this.touchBoundary = options.touchBoundary || 10;


        /**
         * The FastClick layer.
         *
         * @type Element
         */
        this.layer = layer;

        /**
         * The minimum time between tap(touchstart and touchend) events
         *
         * @type number
         */
        this.tapDelay = options.tapDelay || 200;

        /**
         * The maximum time for a tap
         *
         * @type number
         */
        this.tapTimeout = options.tapTimeout || 700;

        if (FastClick.notNeeded(layer)) {
            return;
        }

        // Some old versions of Android don't have Function.prototype.bind
        function bind(method, context) {
            return function() { return method.apply(context, arguments); };
        }


        var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
        var context = this;
        for (var i = 0, l = methods.length; i < l; i++) {
            context[methods[i]] = bind(context[methods[i]], context);
        }

        // Set up event handlers as required
        if (deviceIsAndroid) {
            layer.addEventListener('mouseover', this.onMouse, true);
            layer.addEventListener('mousedown', this.onMouse, true);
            layer.addEventListener('mouseup', this.onMouse, true);
        }

        layer.addEventListener('click', this.onClick, true);
        layer.addEventListener('touchstart', this.onTouchStart, false);
        layer.addEventListener('touchmove', this.onTouchMove, false);
        layer.addEventListener('touchend', this.onTouchEnd, false);
        layer.addEventListener('touchcancel', this.onTouchCancel, false);

        // Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
        // which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
        // layer when they are cancelled.
        if (!Event.prototype.stopImmediatePropagation) {
            layer.removeEventListener = function(type, callback, capture) {
                var rmv = Node.prototype.removeEventListener;
                if (type === 'click') {
                    rmv.call(layer, type, callback.hijacked || callback, capture);
                } else {
                    rmv.call(layer, type, callback, capture);
                }
            };

            layer.addEventListener = function(type, callback, capture) {
                var adv = Node.prototype.addEventListener;
                if (type === 'click') {
                    adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
                            if (!event.propagationStopped) {
                                callback(event);
                            }
                        }), capture);
                } else {
                    adv.call(layer, type, callback, capture);
                }
            };
        }

        // If a handler is already declared in the element's onclick attribute, it will be fired before
        // FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
        // adding it as listener.
        if (typeof layer.onclick === 'function') {

            // Android browser on at least 3.2 requires a new reference to the function in layer.onclick
            // - the old one won't work if passed to addEventListener directly.
            oldOnClick = layer.onclick;
            layer.addEventListener('click', function(event) {
                oldOnClick(event);
            }, false);
            layer.onclick = null;
        }
    }

    /**
     * Windows Phone 8.1 fakes user agent string to look like Android and iPhone.
     *
     * @type boolean
     */
    var deviceIsWindowsPhone = navigator.userAgent.indexOf("Windows Phone") >= 0;

    /**
     * Android requires exceptions.
     *
     * @type boolean
     */
    var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0 && !deviceIsWindowsPhone;


    /**
     * iOS requires exceptions.
     *
     * @type boolean
     */
    var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent) && !deviceIsWindowsPhone;


    /**
     * iOS 4 requires an exception for select elements.
     *
     * @type boolean
     */
    var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


    /**
     * iOS 6.0-7.* requires the target element to be manually derived
     *
     * @type boolean
     */
    var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS [6-7]_\d/).test(navigator.userAgent);

    /**
     * BlackBerry requires exceptions.
     *
     * @type boolean
     */
    var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

    /**
     * Determine whether a given element requires a native click.
     *
     * @param {EventTarget|Element} target Target DOM element
     * @returns {boolean} Returns true if the element needs a native click
     */
    FastClick.prototype.needsClick = function(target) {
        switch (target.nodeName.toLowerCase()) {

            // Don't send a synthetic click to disabled inputs (issue #62)
            case 'button':
            case 'select':
            case 'textarea':
                if (target.disabled) {
                    return true;
                }

                break;
            case 'input':

                // File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
                if ((deviceIsIOS && target.type === 'file') || target.disabled) {
                    return true;
                }

                break;
            case 'label':
            case 'iframe': // iOS8 homescreen apps can prevent events bubbling into frames
            case 'video':
                return true;
        }

        return (/\bneedsclick\b/).test(target.className);
    };


    /**
     * Determine whether a given element requires a call to focus to simulate click into element.
     *
     * @param {EventTarget|Element} target Target DOM element
     * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
     */
    FastClick.prototype.needsFocus = function(target) {
        switch (target.nodeName.toLowerCase()) {
            case 'textarea':
                return true;
            case 'select':
                return !deviceIsAndroid;
            case 'input':
                switch (target.type) {
                    case 'button':
                    case 'checkbox':
                    case 'file':
                    case 'image':
                    case 'radio':
                    case 'submit':
                        return false;
                }

                // No point in attempting to focus disabled inputs
                return !target.disabled && !target.readOnly;
            default:
                return (/\bneedsfocus\b/).test(target.className);
        }
    };


    /**
     * Send a click event to the specified element.
     *
     * @param {EventTarget|Element} targetElement
     * @param {Event} event
     */
    FastClick.prototype.sendClick = function(targetElement, event) {
        var clickEvent, touch;

        // On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
        if (document.activeElement && document.activeElement !== targetElement) {
            document.activeElement.blur();
        }

        touch = event.changedTouches[0];

        // Synthesise a click event, with an extra attribute so it can be tracked
        clickEvent = document.createEvent('MouseEvents');
        clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
        clickEvent.forwardedTouchEvent = true;
        targetElement.dispatchEvent(clickEvent);
    };

    FastClick.prototype.determineEventType = function(targetElement) {

        //Issue #159: Android Chrome Select Box does not open with a synthetic click event
        if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
            return 'mousedown';
        }

        return 'click';
    };


    /**
     * @param {EventTarget|Element} targetElement
     */
    FastClick.prototype.focus = function(targetElement) {
        var length;

        // Issue #160: on iOS 7, some input elements (e.g. date datetime month) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
        if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time' && targetElement.type !== 'month') {
            length = targetElement.value.length;
            targetElement.setSelectionRange(length, length);
        } else {
            targetElement.focus();
        }
    };


    /**
     * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
     *
     * @param {EventTarget|Element} targetElement
     */
    FastClick.prototype.updateScrollParent = function(targetElement) {
        var scrollParent, parentElement;

        scrollParent = targetElement.fastClickScrollParent;

        // Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
        // target element was moved to another parent.
        if (!scrollParent || !scrollParent.contains(targetElement)) {
            parentElement = targetElement;
            do {
                if (parentElement.scrollHeight > parentElement.offsetHeight) {
                    scrollParent = parentElement;
                    targetElement.fastClickScrollParent = parentElement;
                    break;
                }

                parentElement = parentElement.parentElement;
            } while (parentElement);
        }

        // Always update the scroll top tracker if possible.
        if (scrollParent) {
            scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
        }
    };


    /**
     * @param {EventTarget} targetElement
     * @returns {Element|EventTarget}
     */
    FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {

        // On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
        if (eventTarget.nodeType === Node.TEXT_NODE) {
            return eventTarget.parentNode;
        }

        return eventTarget;
    };


    /**
     * On touch start, record the position and scroll offset.
     *
     * @param {Event} event
     * @returns {boolean}
     */
    FastClick.prototype.onTouchStart = function(event) {
        var targetElement, touch, selection;

        // Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
        if (event.targetTouches.length > 1) {
            return true;
        }

        targetElement = this.getTargetElementFromEventTarget(event.target);
        touch = event.targetTouches[0];

        if (deviceIsIOS) {

            // Only trusted events will deselect text on iOS (issue #49)
            selection = window.getSelection();
            if (selection.rangeCount && !selection.isCollapsed) {
                return true;
            }

            if (!deviceIsIOS4) {

                // Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
                // when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
                // with the same identifier as the touch event that previously triggered the click that triggered the alert.
                // Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
                // immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
                // Issue 120: touch.identifier is 0 when Chrome dev tools 'Emulate touch events' is set with an iOS device UA string,
                // which causes all touch events to be ignored. As this block only applies to iOS, and iOS identifiers are always long,
                // random integers, it's safe to to continue if the identifier is 0 here.
                if (touch.identifier && touch.identifier === this.lastTouchIdentifier) {
                    event.preventDefault();
                    return false;
                }

                this.lastTouchIdentifier = touch.identifier;

                // If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
                // 1) the user does a fling scroll on the scrollable layer
                // 2) the user stops the fling scroll with another tap
                // then the event.target of the last 'touchend' event will be the element that was under the user's finger
                // when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
                // is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
                this.updateScrollParent(targetElement);
            }
        }

        this.trackingClick = true;
        this.trackingClickStart = event.timeStamp;
        this.targetElement = targetElement;

        this.touchStartX = touch.pageX;
        this.touchStartY = touch.pageY;

        // Prevent phantom clicks on fast double-tap (issue #36)
        if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
            event.preventDefault();
        }

        return true;
    };


    /**
     * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
     *
     * @param {Event} event
     * @returns {boolean}
     */
    FastClick.prototype.touchHasMoved = function(event) {
        var touch = event.changedTouches[0], boundary = this.touchBoundary;

        if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
            return true;
        }

        return false;
    };


    /**
     * Update the last position.
     *
     * @param {Event} event
     * @returns {boolean}
     */
    FastClick.prototype.onTouchMove = function(event) {
        if (!this.trackingClick) {
            return true;
        }

        // If the touch has moved, cancel the click tracking
        if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
            this.trackingClick = false;
            this.targetElement = null;
        }

        return true;
    };


    /**
     * Attempt to find the labelled control for the given label element.
     *
     * @param {EventTarget|HTMLLabelElement} labelElement
     * @returns {Element|null}
     */
    FastClick.prototype.findControl = function(labelElement) {

        // Fast path for newer browsers supporting the HTML5 control attribute
        if (labelElement.control !== undefined) {
            return labelElement.control;
        }

        // All browsers under test that support touch events also support the HTML5 htmlFor attribute
        if (labelElement.htmlFor) {
            return document.getElementById(labelElement.htmlFor);
        }

        // If no for attribute exists, attempt to retrieve the first labellable descendant element
        // the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
        return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
    };


    /**
     * On touch end, determine whether to send a click event at once.
     *
     * @param {Event} event
     * @returns {boolean}
     */
    FastClick.prototype.onTouchEnd = function(event) {
        var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

        if (!this.trackingClick) {
            return true;
        }

        // Prevent phantom clicks on fast double-tap (issue #36)
        if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
            this.cancelNextClick = true;
            return true;
        }

        if ((event.timeStamp - this.trackingClickStart) > this.tapTimeout) {
            return true;
        }

        // Reset to prevent wrong click cancel on input (issue #156).
        this.cancelNextClick = false;

        this.lastClickTime = event.timeStamp;

        trackingClickStart = this.trackingClickStart;
        this.trackingClick = false;
        this.trackingClickStart = 0;

        // On some iOS devices, the targetElement supplied with the event is invalid if the layer
        // is performing a transition or scroll, and has to be re-detected manually. Note that
        // for this to function correctly, it must be called *after* the event target is checked!
        // See issue #57; also filed as rdar://13048589 .
        if (deviceIsIOSWithBadTarget) {
            touch = event.changedTouches[0];

            // In certain cases arguments of elementFromPoint can be negative, so prevent setting targetElement to null
            targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
            targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
        }

        targetTagName = targetElement.tagName.toLowerCase();
        if (targetTagName === 'label') {
            forElement = this.findControl(targetElement);
            if (forElement) {
                this.focus(targetElement);
                if (deviceIsAndroid) {
                    return false;
                }

                targetElement = forElement;
            }
        } else if (this.needsFocus(targetElement)) {

            // Case 1: If the touch started a while ago (best guess is 100ms based on tests for issue #36) then focus will be triggered anyway. Return early and unset the target element reference so that the subsequent click will be allowed through.
            // Case 2: Without this exception for input elements tapped when the document is contained in an iframe, then any inputted text won't be visible even though the value attribute is updated as the user types (issue #37).
            if ((event.timeStamp - trackingClickStart) > 100 || (deviceIsIOS && window.top !== window && targetTagName === 'input')) {
                this.targetElement = null;
                return false;
            }

            this.focus(targetElement);
            this.sendClick(targetElement, event);

            // Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
            // Also this breaks opening selects when VoiceOver is active on iOS6, iOS7 (and possibly others)
            if (!deviceIsIOS || targetTagName !== 'select') {
                this.targetElement = null;
                event.preventDefault();
            }

            return false;
        }

        if (deviceIsIOS && !deviceIsIOS4) {

            // Don't send a synthetic click event if the target element is contained within a parent layer that was scrolled
            // and this tap is being used to stop the scrolling (usually initiated by a fling - issue #42).
            scrollParent = targetElement.fastClickScrollParent;
            if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
                return true;
            }
        }

        // Prevent the actual click from going though - unless the target node is marked as requiring
        // real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
        if (!this.needsClick(targetElement)) {
            event.preventDefault();
            this.sendClick(targetElement, event);
        }

        return false;
    };


    /**
     * On touch cancel, stop tracking the click.
     *
     * @returns {void}
     */
    FastClick.prototype.onTouchCancel = function() {
        this.trackingClick = false;
        this.targetElement = null;
    };


    /**
     * Determine mouse events which should be permitted.
     *
     * @param {Event} event
     * @returns {boolean}
     */
    FastClick.prototype.onMouse = function(event) {

        // If a target element was never set (because a touch event was never fired) allow the event
        if (!this.targetElement) {
            return true;
        }

        if (event.forwardedTouchEvent) {
            return true;
        }

        // Programmatically generated events targeting a specific element should be permitted
        if (!event.cancelable) {
            return true;
        }

        // Derive and check the target element to see whether the mouse event needs to be permitted;
        // unless explicitly enabled, prevent non-touch click events from triggering actions,
        // to prevent ghost/doubleclicks.
        if (!this.needsClick(this.targetElement) || this.cancelNextClick) {

            // Prevent any user-added listeners declared on FastClick element from being fired.
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            } else {

                // Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
                event.propagationStopped = true;
            }

            // Cancel the event
            event.stopPropagation();
            event.preventDefault();

            return false;
        }

        // If the mouse event is permitted, return true for the action to go through.
        return true;
    };


    /**
     * On actual clicks, determine whether this is a touch-generated click, a click action occurring
     * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
     * an actual click which should be permitted.
     *
     * @param {Event} event
     * @returns {boolean}
     */
    FastClick.prototype.onClick = function(event) {
        var permitted;

        // It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
        if (this.trackingClick) {
            this.targetElement = null;
            this.trackingClick = false;
            return true;
        }

        // Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
        if (event.target.type === 'submit' && event.detail === 0) {
            return true;
        }

        permitted = this.onMouse(event);

        // Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
        if (!permitted) {
            this.targetElement = null;
        }

        // If clicks are permitted, return true for the action to go through.
        return permitted;
    };


    /**
     * Remove all FastClick's event listeners.
     *
     * @returns {void}
     */
    FastClick.prototype.destroy = function() {
        var layer = this.layer;

        if (deviceIsAndroid) {
            layer.removeEventListener('mouseover', this.onMouse, true);
            layer.removeEventListener('mousedown', this.onMouse, true);
            layer.removeEventListener('mouseup', this.onMouse, true);
        }

        layer.removeEventListener('click', this.onClick, true);
        layer.removeEventListener('touchstart', this.onTouchStart, false);
        layer.removeEventListener('touchmove', this.onTouchMove, false);
        layer.removeEventListener('touchend', this.onTouchEnd, false);
        layer.removeEventListener('touchcancel', this.onTouchCancel, false);
    };


    /**
     * Check whether FastClick is needed.
     *
     * @param {Element} layer The layer to listen on
     */
    FastClick.notNeeded = function(layer) {
        var metaViewport;
        var chromeVersion;
        var blackberryVersion;
        var firefoxVersion;

        // Devices that don't support touch don't need FastClick
        if (typeof window.ontouchstart === 'undefined') {
            return true;
        }

        // Chrome version - zero for other browsers
        chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

        if (chromeVersion) {

            if (deviceIsAndroid) {
                metaViewport = document.querySelector('meta[name=viewport]');

                if (metaViewport) {
                    // Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
                    if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
                        return true;
                    }
                    // Chrome 32 and above with width=device-width or less don't need FastClick
                    if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
                        return true;
                    }
                }

                // Chrome desktop doesn't need FastClick (issue #15)
            } else {
                return true;
            }
        }

        if (deviceIsBlackBerry10) {
            blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

            // BlackBerry 10.3+ does not require Fastclick library.
            // https://github.com/ftlabs/fastclick/issues/251
            if (blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
                metaViewport = document.querySelector('meta[name=viewport]');

                if (metaViewport) {
                    // user-scalable=no eliminates click delay.
                    if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
                        return true;
                    }
                    // width=device-width (or less than device-width) eliminates click delay.
                    if (document.documentElement.scrollWidth <= window.outerWidth) {
                        return true;
                    }
                }
            }
        }

        // IE10 with -ms-touch-action: none or manipulation, which disables double-tap-to-zoom (issue #97)
        if (layer.style.msTouchAction === 'none' || layer.style.touchAction === 'manipulation') {
            return true;
        }

        // Firefox version - zero for other browsers
        firefoxVersion = +(/Firefox\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

        if (firefoxVersion >= 27) {
            // Firefox 27+ does not have tap delay if the content is not zoomable - https://bugzilla.mozilla.org/show_bug.cgi?id=922896

            metaViewport = document.querySelector('meta[name=viewport]');
            if (metaViewport && (metaViewport.content.indexOf('user-scalable=no') !== -1 || document.documentElement.scrollWidth <= window.outerWidth)) {
                return true;
            }
        }

        // IE11: prefixed -ms-touch-action is no longer supported and it's recomended to use non-prefixed version
        // http://msdn.microsoft.com/en-us/library/windows/apps/Hh767313.aspx
        if (layer.style.touchAction === 'none' || layer.style.touchAction === 'manipulation') {
            return true;
        }

        return false;
    };


    /**
     * Factory method for creating a FastClick object
     *
     * @param {Element} layer The layer to listen on
     * @param {Object} [options={}] The options to override the defaults
     */
    FastClick.attach = function(layer, options) {
        return new FastClick(layer, options);
    };


    if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {

        // AMD. Register as an anonymous module.
        define(function() {
            return FastClick;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = FastClick.attach;
        module.exports.FastClick = FastClick;
    } else {
        window.FastClick = FastClick;
    }
}());


//以上是FastClick库，是为了处理ios端的click时间中300毫秒延时

Date.prototype.format = function(fmt) {
     var o = {
        "M+" : this.getMonth()+1,                 //月份
        "d+" : this.getDate(),                    //日
        "h+" : this.getHours(),                   //小时
        "m+" : this.getMinutes(),                 //分
        "s+" : this.getSeconds(),                 //秒
        "q+" : Math.floor((this.getMonth()+3)/3), //季度
        "S"  : this.getMilliseconds()             //毫秒
    };
    if(/(y+)/.test(fmt)) {
            fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
    }
     for(var k in o) {
        if(new RegExp("("+ k +")").test(fmt)){
             fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
         }
     }
    return fmt;
}
// 以上是日期格式化函数

function closeWin() {
	api.sendEvent({
	    name:'new_init'
    });
    api.closeWin();
}

//自定义打开新窗口
function open_window(windir,winname,pageobj) {
    if(!pageobj){
        pageobj = {};//默认赋值
    }
    api.openWin({
        name: winname,
        url: 'widget://html/'+windir+'/'+winname+'.html',
        pageParam: pageobj
    });
}

function go_back_url(frm_name) {
    api.historyBack({
        frameName: frm_name
    }, function(ret, err) {
        if (!ret.status) {
            //api.closeWin();
        }
    });
}

function body_click_init() {
    if ('addEventListener' in document) {
        document.addEventListener('DOMContentLoaded', function() {
            FastClick.attach(document.body);
        }, false);
    }
}

//0:iPhone 1:Android
function ismobile(test){
    var u = navigator.userAgent, app = navigator.appVersion;
    if(/AppleWebKit.*Mobile/i.test(navigator.userAgent) || (/MIDP|SymbianOS|NOKIA|SAMSUNG|LG|NEC|TCL|Alcatel|BIRD|DBTEL|Dopod|PHILIPS|HAIER|LENOVO|MOT-|Nokia|SonyEricsson|SIE-|Amoi|ZTE/.test(navigator.userAgent))){
        if(window.location.href.indexOf("?mobile")<0){
            try{
                if(/iPhone|mac|iPod|iPad/i.test(navigator.userAgent)){
                    return '0';
                }else{
                    return '1';
                }
            }catch(e){}
        }
    }else if( u.indexOf('iPad') > -1){
        return '0';
    }else{
        return '1';
    }
};
if(ismobile() == 0){
    body_click_init();
}else{
    //console.log('is Android');
}

function server(){
var mq = api.require('meiQia');

	var param = {
	    appkey: "e22088e9f5e1f6098f17df192bb012a9"
	};

	mq.initMeiQia(param, function(ret, err) {
	    if (ret) {

	        console.log(JSON.stringify(ret));
	        mq.show();
	    } else {


	    }
	})

}


function focus(){//解决IOS端的input无法再次点击的问题

	if(api.systemType=='ios'){
		var softInput = api.require('softInputMgr');
	    softInput.toggleKeyboard();
	}
}

function check_login(windir,winname,pageobj){

		var token = $api.getStorage('token');
		if(!token){
      if(!pageobj){
          pageobj = {};//默认赋值
      }
			api.openWin({
	            name: 'login',
	            url: 'widget://html/login/login.html',
	            animation:{
	            	type:"movein",
	            	subType:"from_bottom",
	            	duration:300
	            },
              pageParam: pageobj
	        });
		}else{
			open_window(windir,winname)
		}

}

function is_login(){
  var token = $api.getStorage('token');
  if(!token){
      api.openWin({
          name: 'login',
          url: 'widget://html/login/login.html',
          animation:{
            type:"movein",
            subType:"from_bottom",
            duration:300
          }
      });

      return;
  }

}

function open_meiQia() {
    var mq = api.require('meiQia');//配置初始化美洽需要的appkey
    var param = {
        appkey: "e22088e9f5e1f6098f17df192bb012a9"//初始化美洽
    };
    mq.initMeiQia(param, function(ret, err) {
        if (ret) {
            //初始化成功
            mq.setTitleColor({
                color: "#4A4A4A"
            });
            mq.setTitleBarColor({
                color: "#ffffff"//设置标题栏背景颜色
            });
            mq.show();
        } else {

            alert(JSON.stringify(err));//初始化失败
        }
    })
}


function resize(){
	var winHeight = $(window).height();   //获取当前页面高度
		$(window).resize(function(){
		   var thisHeight=$(this).height();
		    if(winHeight - thisHeight >50){
		         $("footer").hide();

		    }else{
		        $("footer").show();

		    }
		});
}

function get_data(name){

	var td = api.require('talkingData');
	   td.onPageStart({pageName:name});
	   td.onPageEnd({pageName:name});
}
function alert_shop(){
  var dialogBox = api.require('dialogBox');
   dialogBox.alert({
      texts: {
          title: '提示',
          content: '申请门店代理之后才能看到商品价格哦！快去申请吧',
          leftBtnTitle: '暂时不',
          rightBtnTitle: '去申请'
      },
      styles: {
          bg: '#fff',
          w: 300,
          corner:2,
          title:{                //（可选项）JSON对象；弹窗标题栏样式配置，不传则不显示标题区域
               marginT: 20,       //（可选项）数字类型；标题栏与对话框顶端间距；默认：20
               icon: '',          //（可选项）字符串类型；标题前面的图标路径，要求本地路径（widget://、fs://）；图片为正方形的，如：50*50、100*100，建议开发者传大小合适的图片以适配高分辨率手机屏幕，不传则不显示
               iconSize: 40,      //（可选项）数字类型；icon 图标边长大小,若 icon 不存在则此参数无效；默认：24
               titleSize: 14,     //（可选项）数字类型；标题字体大小；默认：14
               titleColor: '#000' //（可选项）字符串类型；标题字体颜色，支持#、rgb、rgba；默认：#fff
           },
          content: {
              color: '#000',
              size: 14
          },
          left: {
              marginB: 7,
              marginL: 20,
              w: 130,
              h: 35,
              corner: 2,
              bg: '#fff',
              color: '#000',
              size: 12
          },
          right: {
              marginB: 7,
              marginL: 10,
              w: 130,
              h: 35,
              corner: 2,
              bg: '#fff',
              color: '#45a1b4',
              size: 12
          }
      }
   }, function(ret) {
      if (ret.eventType == 'left') {
          var dialogBox = api.require('dialogBox');
          dialogBox.close({
              dialogName: 'alert'
          });
      }else{
        var dialogBox = api.require('dialogBox');
        dialogBox.close({
            dialogName: 'alert'
        });
        setTimeout(function(){
          api.openWin({
               name: 'shenqingDli_win',
               url: 'widget://html/index/shenqingDli_win.html',
           });
        },300)
      }
   });
}

//var base_url = "http://192.168.1.114:8083";
//var base_url = "http://192.168.1.175:529";
// var base_url = "http://192.168.0.165:8080";
var base_url = "http://9rongcang.yunxiaochengxu.top";
var qiniu = 'http://9rc.yunxiaochengxu.top'
//通用
var prefecture_gooods_list_url = base_url + '/jrcapp/goods/prefecture_gooods_list';//商品列表
var good_detail_url = base_url + '/jrcapp/goods/good_detail';//商品详情
var cart_num_url = base_url + '/jrcapp/cart/cart_num';//购物车 数量
var add_footprint_url = base_url + '/jrcapp/my/add_footprint';//我的足迹
var goods_coll_url = base_url + '/jrcapp/goods/goods_coll';//收藏
var goods_spec_url = base_url + '/jrcapp/goods/goods_spec';//商品规格
var cart_add_url = base_url + '/jrcapp/cart/cart_add';//加入购物车
var goods_evaluate_url = base_url + '/jrcapp/goods/goods_evaluate';//查看商品全部评论
var goods_service_url = base_url + '/jrcapp/goods/goods_service';//服务列表
var get_coupon_app_url = base_url + '/jrcapp/coupon/get_coupon_app';//去领劵
var get_coupon_url = base_url + '/jrcapp/coupon/get_coupon';//点击优惠券领取
var add_num_url = base_url + '/jrcapp/goods/add_num';//商品详情规格添加数量
var goods_option_detail_url = base_url + '/jrcapp/goods/goods_option_detail';//点击规格回到商品详情

//购物车
var cartlist_url = base_url + '/jrcapp/cart/cart_list';//服务无处列表一
var cart_delete_url = base_url + '/jrcapp/cart/cart_del';//清空商品和删除单个商品(把巨众的拿过来)
var add_to_cart_url = base_url + '/jrcapp/cart/add_to_cart';//购物车添加数量(把巨众的拿过来用就行了)
var minus_to_cart_url = base_url + '/jrcapp/cart/minus_to_cart';//购物车减数量(把巨众的拿过来用就行了)
var check_one_cart_url = base_url + '/jrcapp/cart/check_one_cart';//单选和取消勾选 (把巨众的拿过来)
var check_cart_url = base_url + '/jrcapp/cart/select_cart';//购物车全选与全不选 默认全选（把巨众的拿过来用就行了）
var cart_submit_url = base_url + '/jrcapp/cart/cart_submit';//点击购物车提交到确认订单页面
var goods_submit_url= base_url + '/jrcapp/cart/buy_submit';//立即购买到确认订单页面
var select_good_attr_url = base_url + '/jrcapp/cart/select_good_attr';//去选择优惠券
var select_coupon_url = base_url + '/jrcapp/cart/select_coupon';//优惠券
var cart_select_coupon_url = base_url + '/jrcapp/cart/cart_select_coupon';//购物车优惠券就算
//支付
var bank_my_order_submit_url = base_url + '/jrcapp/unionpay/my_order_submit';//订单列表中的订单提交   银联支付
var bulidParam_url = base_url + '/jrcapp/unionpay/bulidParam';//立即购买银联支付(把其它支付方式的参数拿过
var bank_backUrl_url = base_url + '/jrcapp/unionpay/select_order_status';//建行回调
var cart_bulidParam_url = base_url + '/jrcapp/unionpay/cart_bulidParam';//购物车提交
var goods_order_submits_url = base_url + '/jrcapp/wx/goods_order_submit';//立即购买 微信支付
var goods_order_submit_url = base_url + '/jrcapp/alipay/goods_order_submit';//立即购买 支付宝支付
var wx_order_submit_url = base_url + '/jrcapp/wx/wx_order_submit';//购物车的商品 订单提交  微信支付
var alipay_submit_order_url = base_url + '/jrcapp/alipay/alipay_submit_order';//购物车提交到确认订单页面  支付宝支付
//积分
var score_good_detail_url = base_url + '/jrcapp/score/score_good_detail';//积分详情
var confirm_redeem_url = base_url + '/jrcapp/score/redeem_now';//立即兑换
var confirm_exchange_url = base_url + '/jrcapp/score/confirm_exchange';//确认兑换
//订单
var order_list_url = base_url + '/jrcapp/order/order_list';//订单列表 (参考柏源)
var confirm_receipt_url = base_url + '/jrcapp/order/confirm_delivery';//订单列表中 点击确认收货（把柏源的拿过来就行了）
var order_details_url = base_url + '/jrcapp/order/order_details';//订单列表中 查看详情（参考柏源）
var get_evaluate_list_url = base_url + '/jrcapp/order/get_evaluate_list';//点击去评价进入商品评价列表（将柏源 的拿过来）
var get_evaluate_url = base_url + '/jrcapp/order/get_evaluate';//添加评价保存(将柏源的拿过来，多了个物流评价)
var check_evaluate_url = base_url + '/jrcapp/order/check_evaluate';//查看当前商品的评论（将柏源的拿过来就行了）

var my_order_submit_url = base_url + '/jrcapp/alipay/my_order_submit';//订单列表中的订单提交   支付宝支付（把柏源的拿过来）
var wx_my_order_submit_url = base_url + '/jrcapp/wx/wx_my_order_submit';//订单列表中的订单提交 微信支付 (把柏源的拿过来)
var order_del_url = base_url + '/jrcapp/order/order_del';//订单取消

var refund_cause_list_url = base_url + '/jrcapp/order/refund_cause_list';//订单原因接口
var refund_apply_url = base_url + '/jrcapp/order/refund_apply';//申请退款
var logistics_evaluate_save_url = base_url + '/jrcapp/order/logistics_evaluate_save';//添加物流评价
//筛选
var country_url = base_url + '/jrcapp/goods/country';//国家分类
var goods_one_classify_url = base_url + '/jrcapp/goods/goods_one_classify';  //商品的一级分类（商品筛选时会用到）
//首页
var index_url = base_url + "/jrcapp/index/index";  //首页
var is_shop_url = base_url + '/jrcapp/index/is_shop';//判断账号在该区域是否是门店
var city_list_url = base_url + '/jrcapp/index/city_list';//首页区域
var banners_url = base_url + '/jrcapp/index/banners';//banner列表
var pre_banners_url = base_url + '/jrcapp/index/pre_banners';
var index_navigation_url = base_url + '/jrcapp/index/navigation';//五个分类
var index_navigations_url = base_url + '/jrcapp/index/navigation';//中间专区
var select_brand_more_url = base_url + '/jrcapp/index/select_brand_more';//点击精选品牌查看更多
var guess_you_like_url = base_url + '/jrcapp/index/guess_you_like';//猜你喜欢
var new_comers_url = base_url + '/jrcapp/index/new_comers';//查看是否有优惠卷，判断是否领取，有的话首页弹出新人优惠卷
//消息
var unread_num_url = base_url + '/jrcapp/message/unread_num';//未读消息的数量
var news_list_url= base_url + '/jrcapp/message/unread_num_list';//未各个类型的未读数量
var message_list_url = base_url + '/jrcapp/message/message_list';//某个类型消息的列表
//积分
var exchange_logs_url = base_url + '/jrcapp/score/exchange_record';//积分商品兑换记录
var exchange_record_detail_url = base_url + '/jrcapp/score/exchange_record_detail';//积分兑换记录详情
//定制页面背景图
var customized_background_url = base_url + '/jrcapp/index/customized_background';//定制页面背景图
var customized_submit_url = base_url + '/jrcapp/index/customized_submit';//提交定制
//分类
var classify_list_url = base_url+"/jrcapp/goods/classify_list";//分类
var classify_goods_url = base_url+"/jrcapp/goods/classify_goods";//分类商品
var prefecture_url = base_url + '/jrcapp/index/prefecture';//3：无门槛图片 4：热销推荐 5：新品推荐6：积分7：特价
var skill_goods_url = base_url + '/jrcapp/goods/skill_goods';//首页秒杀
var select_brand_url = base_url + '/jrcapp/index/select_brand';//首页是个品牌
var skill_goods_more_url = base_url + '/jrcapp/goods/skill_goods_more';//更多秒杀
var store_audit_url = base_url + '/jrcapp/index/store_audit';//门店提交
var score_good_list_url = base_url + '/jrcapp/score/score_good_list';//积分商城
//登录
var background_image_url = base_url + '/jrcapp/login/background_image';//背景图
var is_open_url = base_url + '/jrcapp/login/is_open';//是否开启
var send_reg_code_url = base_url + '/jrcapp/login/send_reg_code';//发送验证吗
var login_code_url = base_url + '/jrcapp/login/login';//短信登录
var next_password_url = base_url + '/jrcapp/login/next_password';//第一次登录设置密码
var pass_account_url = base_url + '/jrcapp/login/pass_login'; //手机号，密码登录接口
var reset_pwd_url = base_url + '/jrcapp/login/reset_pwd';//忘记密码保存
var forget_password_url = base_url + '/jrcapp/login/forget_password';//忘记密码发送验证码
var wx_login_url = base_url + '/jrcapp/login/wx_login';//微信登录
var new_phone_save_url = base_url + '/jrcapp/login/new_phone_save';//绑定手机号
var xieyi_url = base_url + '/jrcapp/my/user_agreement';//用户协议
var privacy_policy_url = base_url + '/jrcapp/my/privacy_policy';//隐私政策
//地址
var address_list_url = base_url + '/jrcapp/address/address_list';//地址列表
var is_default_url = base_url + '/jrcapp/address/is_default';//地址涉默认
var address_del_url= base_url + '/jrcapp/address/address_del';//地址s删除
var address_update_url= base_url + '/jrcapp/address/address_update';//地址修改
var add_address_url= base_url + '/jrcapp/address/add_address';//地址添加

var customized_background_url = base_url + '/jrcapp/index/customized_background';//定制页面背景图

//我的
var my_index_url = base_url+"/jrcapp/my/my";//我的首页
var my_save_url = base_url+"/jrcapp/my/my_save";//资料保存
var order_num_url = base_url+"/jrcapp/my/order_num";//订单数量
var my_coll_url = base_url+"/jrcapp/my/my_coll";//我的收藏列表
var coll_del_url = base_url+"/jrcapp/my/coll_del";//删除收藏
var footprint_url = base_url+"/jrcapp/my/footprint";//我的足迹
var add_footprint_url = base_url+"/jrcapp/my/add_footprint";//添加足迹
var footprint_del_url = base_url+"/jrcapp/my/footprint_del";//足迹删除
var show_phone_url = base_url+"/jrcapp/login/show_phone";//更换手机号显示当前号码
var next_step_url = base_url+"/jrcapp/login/next_step";//更换手机号点击下一步
var common_problem_url = base_url+"/jrcapp/my/common_problem";//常见问题
var user_feedback_save_url = base_url+"/jrcapp/my/user_feedback_save";//意见反馈
var my_integral_url = base_url+"/jrcapp/my/my_integral";//我的积分
var my_coupon_url = base_url+"/jrcapp/my/my_coupon";//我的优惠券
var score_good_list_url = base_url+"/jrcapp/score/score_good_list";//积分列表
var check_douglas_detail_url = base_url  + '/jrcapp/my/check_douglas_detail';  //查看门店详情

var information_change_getMobileCode_url = base_url + '/jrcapp/login/information_change_getMobileCode';//信息变更发送验证码
var setuserPassword_url = base_url + '/jrcapp/login/update_password';//密码修改
var bindingOpenId_url = base_url + '/jrcapp/login/wx_binding';//绑定微信
var untyingOpenId_url = base_url + '/jrcapp/login/wx_unbind';//微信解绑


var cart_good_coupon_url = base_url + '/jrcapp/cart/cart_good_coupon';//购物车列表选择商品优惠
//分享
var goods_share_url = base_url + '/jrcapp/share/goods_share';//商品分享接口
var app_share_url = base_url + '/jrcapp/share/app_share';//app分享接口
