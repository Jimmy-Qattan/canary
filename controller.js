const connect = document.getElementById("enableGameController");
let connected = false;

let gamepad = null;

let disconnectMessageSent = true;

let axisPositions;
const axisPositionChangeThreshold = 0.1; // Experiment Different Values

const axisRestingThreshold = 0.05;

const buttonsOrder = [
  "x",
  "o",
  "square",
  "triangle",
  "leftButton",
  "rightButton",
  "leftTrigger",
  "rightTrigger",
  "leftFlash",
  "rightFlash",
  "leftThumb",
  "rightThumb",
  "upArrow",
  "downArrow",
  "leftArrow",
  "rightArrow",
  "PS5",
  "screen",
];

class controller {
  constructor(button, axis, holdingButton = false) {
    this.button = button;
    this.axis = axis;
    this.holdingButton = holdingButton;
    this.axisRestThreshold = 0.05;
    this.interval = null;
  }

  zeroAxis() {
    this.axis.forEach((ax) => {
      if (Math.abs(ax.x) <= this.axisRestThreshold) {
        ax.x = 0.0;
      }

      if (Math.abs(ax.y) <= this.axisRestThreshold) {
        ax.y = 0.0;
      }
    });
  }
}

const gameController = new controller(null, [
  { x: null, y: null },
  { x: null, y: null },
]);

connect.addEventListener("click", function () {
  let connection = window.addEventListener("gamepadconnected", (event) => {
    gamepad = event.gamepad;
    console.log("Connected to " + gamepad.id);

    connected = true;
    disconnectMessageSent = false;

    connection = null;

    readInputLoop();
  });
});

window.addEventListener("gamepaddisconnected", (event) => {
  console.log("Controller disconnected: " + event.gamepad.id);
  connected = false;
  gamepad = null;
});

function turnToAllNumbers(arr, truncate = false, digits = 0) {
  let newArray = [];

  arr.forEach((value, index) => {
    let newValue = Number(value);

    if (truncate) {
      newValue *= Math.pow(10, digits);
      newValue = Math.trunc(newValue) / Math.pow(10, digits);
    }

    newArray[index] = newValue;
  });

  return newArray;
}

/**@param {controller} controller */

function hasAxisChanges(controller, newAxis, threshold) {
  const oldPositions = turnToAllNumbers(
    [
      controller.axis[0].x,
      controller.axis[0].y,
      controller.axis[1].x,
      controller.axis[1].y,
    ],
    true,
    2,
  );

  const newPositions = turnToAllNumbers(newAxis, true, 2);

  let indexes = [];

  for (let i = 0; i < newPositions.length; i++) {
    if (Math.abs(newPositions[i] - oldPositions[i]) > threshold) {
      indexes.push(i);
    }
  }

  if (indexes.length >= 1) {
    return indexes;
  } else {
    return 0;
  }
}

function truncate(number, digits) {
  let newNum = number * Math.pow(10, digits);
  newNum = Math.trunc(newNum);
  newNum /= Math.pow(10, digits);

  return newNum;
}

function readInputLoop() {
  function loop() {
    if (connected && gamepad) {
      gamepad = navigator.getGamepads()[0];

      let nowHoldingButton = false;

      gamepad.buttons.forEach((button, index) => {
        if (button.pressed) {
          nowHoldingButton = true;
        }

        if (
          !gameController.holdingButton &&
          nowHoldingButton /*button.pressed && gameController.button != index*/
        ) {
          gameController.button = index;
          console.log(
            `The Button ${buttonsOrder[index]} has been pressed at index ${index}`,
          );
          gameController.holdingButton = true;

          window.dispatchEvent(
            new CustomEvent("controllerButton", {
              detail: { button: buttonsOrder[index] },
            }),
          );
        }
      });

      if (!nowHoldingButton) {
        gameController.holdingButton = false;
      }

      const axis1 = [0, 1];
      const axis2 = [2, 3];

      const allAxis = [axis1, axis2];

      let axisHasChanged = false;

      if (hasAxisChanges(gameController, gamepad.axes, 0.03)) {
        axisHasChanged = true;

        gameController.axis[0].x = truncate(gamepad.axes[0], 2);
        gameController.axis[0].y = -truncate(gamepad.axes[1], 2);
        gameController.axis[1].x = truncate(gamepad.axes[2], 2);
        gameController.axis[1].y = -truncate(gamepad.axes[3], 2);

        gameController.zeroAxis();

        window.dispatchEvent(
          new CustomEvent("controllerAxis", { detail: gameController }),
        );
      }

      if (!disconnectMessageSent) {
        console.log("The gamepad has been disconnected");
        disconnectMessageSent = true;
      }
    }

    requestAnimationFrame(loop);
  }

  loop();
}

const showPositions = document.getElementById("showJoyPositions");
const positionDiv = document.getElementById("controllerDiv");

const textEl = positionDiv.querySelectorAll("h1");
console.log(textEl);

function canShowData() {
  return positionDiv.style.visibility != "hidden" ? true : false;
}

showPositions.addEventListener("click", function () {
  if (positionDiv.style.visibility != "hidden") {
    positionDiv.style.visibility = "hidden";
    showPositions.innerHTML = "Show Controller Positions";
  } else {
    positionDiv.style.visibility = "";
    showPositions.innerHTML = "Hide Controller Positions";
  }
});

function checkZero(controller) {
  const values = [
    controller.axis[0].x,
    controller.axis[0].y,
    controller.axis[1].x,
    controller.axis[1].y,
  ];
  let zero = true;

  values.forEach((val) => {
    if (val) {
      zero = false;
    }
  });

  return zero;
}

// For good stuff

window.addEventListener("controllerButton", function (event) {
  if (canShowData) {
    textEl[2].innerHTML = "Button (Index) Clicked: " + event.detail?.button;
  }
});

window.addEventListener("controllerAxis", function (event) {
  if (canShowData) {
    textEl[0].innerHTML = `Stick 1 Coords: X: ${event.detail?.axis[0].x}, Y: ${event.detail?.axis[0].y}`;
    textEl[1].innerHTML = `Stick 2 Coords: X: ${event.detail?.axis[1].x}, Y: ${event.detail?.axis[1].y}`;
  }
});

window.setInterval(function () {
  if (!gameController.axis[0].x) return;
  window.dispatchEvent(
    new CustomEvent("controllerAxis", {
      detail: gameController,
      zero: checkZero(gameController),
    }),
  );

  console.log(checkZero(gameController));
}, 10);
