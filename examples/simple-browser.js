(function () {
    function bindEvent(element, event, handler) {
        if (element.attachEvent) {
            element.attachEvent("on" + event, handler);
            return;
        }

        if (element.addEventListener) {
            element.addEventListener(event, handler, false);
            return;
        }
    }

    var indicator = document.createElement("h1");
    indicator.innerHTML = "Press a key on your keyboard.";
    document.body.appendChild(indicator);

    bindEvent(window, "keyup", function (e) {
        buster.multicastClient.emit("update", e.keyCode);
    });

    buster.multicastClient.on("update", function (event) {
        indicator.innerHTML += String.fromCharCode(event.data);
    });
}());