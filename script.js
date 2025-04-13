const display = document.getElementById('display');
let ans = 0;

function appendValue(value) {
  if (display.innerText === '0' && value !== '.') {
    display.innerText = value;
  } else {
    display.innerText += value;
  }
}

function clearDisplay() {
  display.innerText = '0';
}

function calculate() {
  try {
    const result = eval(display.innerText.replace('×', '*').replace('÷', '/'));
    ans = result; // Store the result for reuse
    display.innerText = result;
  } catch {
    display.innerText = 'Error';
  }
}

function calculatePow() {
  const base = parseFloat(display.innerText);
  const exponent = prompt('Enter the exponent:');
  if (!isNaN(base) && !isNaN(exponent)) {
    const result = Math.pow(base, exponent);
    ans = result;
    display.innerText = result;
  } else {
    display.innerText = 'Error';
  }
}

function calculateCos() {
  const value = parseFloat(display.innerText);
  if (!isNaN(value)) {
    const result = Math.cos((value * Math.PI) / 180).toFixed(8); // Convert to radians
    ans = result;
    display.innerText = result;
  } else {
    display.innerText = 'Error';
  }
}

function calculateSqrt() {
  const value = parseFloat(display.innerText);
  if (value >= 0) {
    const result = Math.sqrt(value).toFixed(8);
    ans = result;
    display.innerText = result;
  } else {
    display.innerText = 'Error';
  }
}

function calculateFactorial() {
  const value = parseInt(display.innerText);
  if (value >= 0 && Number.isInteger(value)) {
    let result = 1;
    for (let i = 1; i <= value; i++) {
      result *= i;
    }
    ans = result;
    display.innerText = result;
  } else {
    display.innerText = 'Error';
  }
}

function reuseAns() {
  display.innerText = ans;
}
