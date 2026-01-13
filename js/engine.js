// ----------------------
// Pyodide Loader
// ----------------------
let pyodideReady = null;

async function getPyodideInstance() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide(); // Provided by pyodide.js
  }
  return await pyodideReady;
}

// ----------------------
// Load Challenge
// ----------------------
async function loadChallenge() {
  const params = new URLSearchParams(window.location.search);
  const challengeId = params.get("challenge");

  if (!challengeId) {
    document.body.innerHTML = "<h2 style='color:red'>❌ No challenge specified in URL.</h2>";
    return;
  }

  let challenges;
  try {
    const res = await fetch("challenges.json");
    challenges = await res.json();
  } catch (e) {
    document.body.innerHTML = "<h2 style='color:red'>❌ Failed to load challenges.json</h2>";
    return;
  }

  const c = Array.isArray(challenges) ? challenges.find(ch => ch.id === challengeId) : null;

  if (!c) {
    document.body.innerHTML = `
      <h2 style="color:red">❌ Challenge not found: ${challengeId}</h2>
      <p>Check spelling or challenges.json</p>
    `;
    return;
  }

  // ----------------------
  // Load Template CSS
  // ----------------------
  document.getElementById("theme-css").href = `templates/${c.template}.css`;

  // ----------------------
  // Load Challenge Text
  // ----------------------
  document.getElementById("challenge-description").textContent = c.challenge_description;
  document.getElementById("challenge-stamp").textContent = c.challenge_stamp;

  // Tasks
  const taskList = document.getElementById("challenge-tasks");
  taskList.innerHTML = "";
  (c.tasks || []).forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    taskList.appendChild(li);
  });

  // Example
  document.getElementById("challenge-example").textContent = c.example || "";

  // Starter code
  document.getElementById("editor").value = c.starter_code || "";

  // ----------------------
  // Setup challenge variables
  // ----------------------
  window.__SETUP_CODE__       = c.setup_code || "";
  window.__TEST_CODE__        = c.test_code || "output"; // default to last expression
  window.__FLAG__             = c.flag || "";
  window.__REQUIRED_TERMS__   = c.required_terms || [];
  window.__FORBIDDEN_TERMS__  = c.forbidden_terms || [];

  // Handle expected output
  if (c.expected) {
    if (typeof c.expected === "string" && c.expected.startsWith("assets/")) {
      try {
        const res = await fetch(c.expected);
        window.__EXPECTED__ = await res.text();
      } catch {
        console.warn(`Failed to load expected file ${c.expected}`);
        window.__EXPECTED__ = "";
      }
    } else {
      window.__EXPECTED__ = c.expected;
    }
  } else {
    window.__EXPECTED__ = "";
  }
}

// ----------------------
// Run User Code
// ----------------------
async function runCode() {
  const userCode = document.getElementById("editor").value;
  const outputEl = document.getElementById("output");

  outputEl.value = ""; // clear previous output

  try {
    const pyodide = await getPyodideInstance();

    // ----------------------
    // Load setup_code (support external file paths)
    // ----------------------
    let setupCode = window.__SETUP_CODE__ || "";

    const fileAssignRegex = /=\s*"(.*?)"/g;
    const matches = [...setupCode.matchAll(fileAssignRegex)];

    for (const match of matches) {
      const fullMatch = match[0];
      const filePath = match[1];
      try {
        const res = await fetch(filePath);
        let content = await res.text();
        // Use triple quotes for multiline Python strings
        setupCode = setupCode.replace(fullMatch, `= """${content}"""`);
      } catch {
        console.warn(`Failed to load file ${filePath}, keeping original string`);
      }
    }

    // ----------------------
    // Run setup code
    // ----------------------
    if (setupCode) {
      await pyodide.runPythonAsync(setupCode);
    }

    // ----------------------
    // Check forbidden terms
    // ----------------------
    const userCodeLower = userCode.toLowerCase();
    let violatedForbidden = false;
    for (const term of window.__FORBIDDEN_TERMS__ || []) {
      if (term && userCodeLower.includes(term.toLowerCase())) {
        outputEl.value = `❌ Forbidden term used: "${term}"`;
        violatedForbidden = true;
        break;
      }
    }
    if (violatedForbidden) return;

    // ----------------------
    // Check required terms
    // ----------------------
    let missingRequired = false;
    for (const term of window.__REQUIRED_TERMS__ || []) {
      if (term && !userCodeLower.includes(term.toLowerCase())) {
        missingRequired = true; // silent fail, do not output
        break;
      }
    }

    // ----------------------
    // Run user code
    // ----------------------
    await pyodide.runPythonAsync(userCode);

    // ----------------------
    // Run test code and capture output
    // ----------------------
    let result = await pyodide.runPythonAsync(window.__TEST_CODE__ || "output");
    
    // ----------------------
    // Normalize line endings for comparison
    // ----------------------
    const normalize = str => str.replace(/\r\n/g,'\n').trim();
    const normalizedResult = normalize(result.toString());
    const normalizedExpected = normalize(window.__EXPECTED__);

    // ----------------------
    // Compare result
    // ----------------------
    if (!missingRequired && !violatedForbidden && normalizedResult === normalizedExpected) {
      outputEl.value = `✅ SUCCESS\n${window.__FLAG__}`;
    } else {
      // Show result for debugging, unless it's a successful flag
      outputEl.value = `▶️ Python Output:\n${normalizedResult}`;
    }

  } catch (err) {
    outputEl.value = "⚠️ Error while running code:\n" + err;
  }
}

// ----------------------
// Initialize
// ----------------------
loadChallenge();


