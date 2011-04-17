(function () {
    var indicator = document.createElement("h1");
    indicator.innerHTML = "Press a key on your keyboard.";
    document.body.appendChild(indicator);

    window.addEventListener("keyup", function (e) {
        buster.multicastClient.emit("update", e.keyCode);
    }, false);

    buster.multicastClient.on("update", function (event) {
        indicator.innerHTML = String.fromCharCode(event.data);
    });
}());