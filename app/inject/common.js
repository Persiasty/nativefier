var MAX_NUM_TRY = 60;
var RETRY_TIME_MS = 500;
var LETTER_TYPE_TIME_MS = 50;

var waitFor = function(selector, text = undefined) {
    if (text) {
        console.log("waiting for " + selector + " with text " + text);
    } else {
        console.log("waiting for " + selector);
    }

    return new Promise((resolve, reject) => {
        try {
            let times = 0
            function findIt() {
                let element;
                if (text) {
                    element = Array.from(document.querySelectorAll(selector)).find(e => e.textContent === text);
                } else {
                    element = document.querySelector(selector);
                }

                if (!element) {
                    if (times++ < MAX_NUM_TRY) {
                        setTimeout(findIt, RETRY_TIME_MS);
                    }
                } else {
                    resolve(element);
                }
            }
            findIt()
        } catch (e) {
            console.error(e);
        }
    });
}

var doClick = function(element) {
    return new Promise((resolve, reject) => {
        function fire(name) {
            const event = new MouseEvent(name, {cancellable: true, bubbles: true});
            element.dispatchEvent(event);
        }

        fire('mouseover');
        fire('mousedown');
        fire('click');
        fire('mouseup');
        resolve();
    });
}

var typeIn = function(element, text) {
    return new Promise((resolve, reject) => {
        try {
            element.focus();

            function letter(array) {
                if (array.length === 0) {
                    resolve();
                    return;
                }
                const character = array.shift();
                const keyCode = character.charCodeAt(0);
                element.dispatchEvent(new KeyboardEvent('keydown', {keyCode}));
                element.dispatchEvent(new KeyboardEvent('keypress', {keyCode}));
                element.value += character;
                element.dispatchEvent(new Event('input'));
                element.dispatchEvent(new KeyboardEvent('keyup', {keyCode}));
                setTimeout(function () {
                    letter(array);
                }, LETTER_TYPE_TIME_MS);
            }
            letter(text.split(''));
        } catch (e) {
            console.error(e);
        }
    });
}

console.log("!!! common.js injected !!!");