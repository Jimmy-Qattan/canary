import * as Main from "./script.js";

const graphs = Array.from(document.querySelectorAll("[graphType]"));
let graphContexts = [];

graphs.forEach((graph) => {
  console.log(graph);
  graphContexts.push(graph.getContext("2d"));
});

const maxValues = 200;

let accelerations = [];
let velocities = [];
let positions = [];

function averageOut(arr, num) {
  if (arr.length >= num) {
    let sum = 0;

    for (let i = arr.length - num; i < arr.length; i++) {
      sum += arr[i];
    }

    arr[arr.length - 1] = sum / num;
  }
}

function addDataToArray(arr, val, max, allowInfinite = false) {
  if (isFinite(val) || allowInfinite) {
    if (arr.length < max) {
      arr.push(val);
    } else {
      arr.push(val);
      arr.splice(0, 1);
    }
  }
}

function updateGraph(
  canvas,
  arr,
  padding,
  color = "black",
  label = "",
  min,
  max,
) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const minimumValue = min;
  const maximumValue = max;

  // Range of data to map to the pixel height of the canvas
  const dataRange = maximumValue - minimumValue + padding * 2;
  const yScale = height / dataRange;
  const deltaX = width / (arr.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = color; // Ensure color is set
  ctx.lineWidth = 2;

  ctx.font = "25px Ariel";
  ctx.fillText(label, 0, 20);

  for (let i = 0; i < arr.length; i++) {
    // Map the value to canvas coordinates
    // We subtract the value from max + padding to flip the Y-axis
    const x = i * deltaX;
    const y = (maximumValue + padding - arr[i]) * yScale;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

window.addEventListener("accelerationData", function (event) {
  addDataToArray(accelerations, event.detail?.magnitude * 2000, maxValues);
  averageOut(accelerations, 2);
  //console.log("Acceleration: " + event.detail?.magnitude * 2000);
  updateGraph(
    graphs[0],
    accelerations,
    10,
    "red",
    "Acceleration Graph",
    0,
    100,
  );
});

window.addEventListener("velocityData", function (event) {
  addDataToArray(velocities, event.detail?.magnitude * 2000, maxValues);
  averageOut(velocities, 5);
  //console.log("Velocity: " + event.detail?.magnitude * 2000);
  updateGraph(graphs[1], velocities, 10, "blue", "Velocity Graph", 0, 2000);
});

window.addEventListener("positionData", function (event) {
  addDataToArray(positions, event.detail?.magnitude * 2000, maxValues);
  //averageOut(positions, 5);
  //console.log("Position: " + event.detail?.magnitude * 2000);
  updateGraph(
    graphs[2],
    positions,
    10,
    "green",
    "Position Graph (From Center)",
    0,
    2100,
  );
});
