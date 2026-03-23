/**
 * app.js — Orquestador principal UI + flujo
 * Conecta: file-parser -> tc-generator -> excel-builder
 */

/**
 * Build a UATConfig from form values + test cases. Pure function, no DOM.
 * @param {Object} params
 * @param {string} params.projectName
 * @param {string} params.client
 * @param {string} params.consultant
 * @param {string} params.dateValue — YYYY-MM-DD
 * @param {string} params.locale
 * @param {Object} params.dateOptions
 * @param {string} params.headerColor
 * @param {import('./excel-builder').TestCase[]} params.testCases
 * @returns {import('./excel-builder').UATConfig}
 */
function buildUATConfig({ projectName, client, consultant, dateValue, locale, dateOptions, headerColor, testCases }) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const formattedDate = date.toLocaleDateString(locale, dateOptions);
  return {
    project_name: projectName,
    date: formattedDate,
    client,
    consultant,
    objective: `Verificar el correcto funcionamiento de ${projectName}.`,
    header_color: headerColor,
    test_cases: testCases,
    bugs: [],
  };
}

// Conditional export for Node.js/vitest
if (typeof module !== 'undefined') {
  module.exports = { buildUATConfig };
}

// Browser-only IIFE
if (typeof window !== 'undefined') (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config (frozen constant — modern-javascript-patterns)
  // ---------------------------------------------------------------------------
  const CONFIG = Object.freeze({
    workerUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:8787'
      : 'https://raona-uat-worker.alexoliveperez.workers.dev',
    defaultHeaderColor: '80C1CD',
    dateLocale: 'es-ES',
    dateOptions: Object.freeze({ day: 'numeric', month: 'long', year: 'numeric' }),
  });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  /** @type {File[]} */
  let uploadedFiles = [];
  /** @type {string[]} */
  let features = [];
  /** @type {ExcelJS.Workbook|null} */
  let generatedWorkbook = null;
  /** @type {string} */
  let generatedFilename = '';

  /** @type {number} Maximum features allowed per generation */
  const MAX_FEATURES = 5;

  // ---------------------------------------------------------------------------
  // DOM refs (using data-testid where available)
  // ---------------------------------------------------------------------------
  const $ = (/** @type {string} */ id) => document.getElementById(id);

  const tokenInput = $('team-token');
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const fileChips = $('file-chips');
  const pastedText = $('pasted-text');
  const metaProject = $('meta-project');
  const metaClient = $('meta-client');
  const metaConsultant = $('meta-consultant');
  const metaMinTCs = $('meta-min-tcs');
  const metaDate = $('meta-date');
  const featureInput = $('feature-input');
  const btnAddFeature = $('btn-add-feature');
  const featureChipsEl = $('feature-chips');
  const btnGenerate = $('btn-generate');
  const progressContainer = $('progress');
  const stepExtract = $('step-extract');
  const stepGenerate = $('step-generate');
  const stepExcel = $('step-excel');
  const errorMsg = $('error-msg');
  const warningMsg = $('warning-msg');
  const result = $('result');
  const resultStats = $('result-stats');
  const btnDownload = $('btn-download');

  // ---------------------------------------------------------------------------
  // Utilities (modern-javascript-patterns)
  // ---------------------------------------------------------------------------

  /**
   * Debounce — delays fn execution until after `ms` of inactivity.
   * @param {Function} fn
   * @param {number} ms
   * @returns {Function}
   */
  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /**
   * Get trimmed value from an input element, returns empty string if null.
   * @param {HTMLInputElement|null} el
   * @returns {string}
   */
  const val = (el) => el?.value?.trim() ?? '';

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    // pdf.js worker config (moved from inline script for CSP compliance)
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    metaDate.value = new Date().toISOString().split('T')[0];

    // Restore token from sessionStorage
    const savedToken = sessionStorage.getItem('uat-team-token');
    if (savedToken) tokenInput.value = savedToken;

    // Debounced validation (modern-javascript-patterns)
    const debouncedValidate = debounce(validateForm, 100);

    tokenInput.addEventListener('input', () => {
      sessionStorage.setItem('uat-team-token', tokenInput.value);
      debouncedValidate();
    });

    // Drop zone events
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      addFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', () => {
      addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });

    pastedText.addEventListener('input', debouncedValidate);

    // Feature chips
    btnAddFeature.addEventListener('click', addFeatureFromInput);
    featureInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFeatureFromInput();
      }
    });

    for (const el of [metaProject, metaClient, metaConsultant]) {
      el.addEventListener('input', debouncedValidate);
    }

    btnGenerate.addEventListener('click', runGeneration);

    validateForm();
  }

  // ---------------------------------------------------------------------------
  // File management
  // ---------------------------------------------------------------------------
  // Uses SUPPORTED_EXTENSIONS from file-parser.js (single source of truth)

  function addFiles(files) {
    for (const f of files) {
      const ext = fileExt(f); // from file-parser.js (candidate C: removed duplicate)
      if (SUPPORTED_EXTENSIONS.has(ext) && !uploadedFiles.some(u => u.name === f.name)) {
        uploadedFiles.push(f);
      }
    }
    renderChips();
    validateForm();
  }

  function removeFile(name) {
    uploadedFiles = uploadedFiles.filter(f => f.name !== name);
    renderChips();
    validateForm();
  }

  function renderChips() {
    fileChips.textContent = '';
    for (const f of uploadedFiles) {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.setAttribute('data-testid', 'file-chip');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = f.name;
      chip.appendChild(nameSpan);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '\u00D7';
      removeBtn.setAttribute('aria-label', `Eliminar ${f.name}`);
      removeBtn.addEventListener('click', () => removeFile(f.name));
      chip.appendChild(removeBtn);

      fileChips.appendChild(chip);
    }
  }

  // ---------------------------------------------------------------------------
  // Feature management
  // ---------------------------------------------------------------------------
  function addFeatureFromInput() {
    const name = featureInput.value.trim();
    if (!name) return;
    if (features.includes(name)) { featureInput.value = ''; return; }
    if (features.length >= MAX_FEATURES) return;
    features.push(name);
    featureInput.value = '';
    renderFeatureChips();
  }

  function removeFeature(name) {
    features = features.filter(f => f !== name);
    renderFeatureChips();
  }

  function renderFeatureChips() {
    featureChipsEl.textContent = '';
    for (const name of features) {
      const chip = document.createElement('div');
      chip.className = 'feature-chip';
      chip.setAttribute('data-testid', 'feature-chip');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;
      chip.appendChild(nameSpan);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '\u00D7';
      removeBtn.setAttribute('aria-label', `Eliminar ${name}`);
      removeBtn.addEventListener('click', () => removeFeature(name));
      chip.appendChild(removeBtn);

      featureChipsEl.appendChild(chip);
    }

    // Show/hide limit message
    const existing = featureChipsEl.parentElement.querySelector('.feature-limit-msg');
    if (features.length >= MAX_FEATURES) {
      if (!existing) {
        const msg = document.createElement('p');
        msg.className = 'feature-limit-msg';
        msg.textContent = `Máximo ${MAX_FEATURES} features por generación`;
        featureChipsEl.parentElement.appendChild(msg);
      }
      btnAddFeature.disabled = true;
      featureInput.disabled = true;
    } else {
      if (existing) existing.remove();
      btnAddFeature.disabled = false;
      featureInput.disabled = false;
    }
  }

  /** @returns {string[]} current feature list */
  function getFeatures() {
    return [...features];
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function validateForm() {
    const hasContent = uploadedFiles.length > 0 || val(pastedText).length > 0;
    const hasMeta = val(metaProject) && val(metaClient) && val(metaConsultant);
    const hasToken = val(tokenInput).length > 0;

    btnGenerate.disabled = !(hasContent && hasMeta && hasToken);
  }

  // ---------------------------------------------------------------------------
  // Progress helpers
  // ---------------------------------------------------------------------------
  function resetUI() {
    progressContainer.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    warningMsg.classList.add('hidden');
    result.classList.add('hidden');
    for (const s of [stepExtract, stepGenerate, stepExcel]) {
      s.className = 'progress-step';
      s.querySelector('.progress-bar-fill').style.width = '0%';
    }
  }

  function setStepActive(stepEl) {
    stepEl.classList.add('active');
  }

  function setStepDone(stepEl) {
    stepEl.classList.remove('active');
    stepEl.classList.add('done');
    stepEl.querySelector('.progress-bar-fill').style.width = '100%';
  }

  function setStepError(stepEl) {
    stepEl.classList.remove('active');
    stepEl.classList.add('error');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // Generation flow
  // ---------------------------------------------------------------------------
  async function runGeneration() {
    resetUI();
    btnGenerate.disabled = true;

    try {
      // --- Step 1: Extract text ---
      setStepActive(stepExtract);
      let extractedText = '';

      if (uploadedFiles.length > 0) {
        const { text, truncated } = await parseUploadedFiles(uploadedFiles);
        extractedText = text;
        if (truncated) {
          warningMsg.textContent = 'Documento muy largo — se han procesado los primeros ~50.000 caracteres.';
          warningMsg.classList.remove('hidden');
        }
      }

      const pasted = val(pastedText);
      if (pasted) {
        extractedText = extractedText ? `${extractedText}\n\n${pasted}` : pasted;
      }

      if (!extractedText.trim()) {
        throw new Error('No se ha podido extraer texto de la documentación.');
      }

      setStepDone(stepExtract);

      // --- Step 2: Generate TCs ---
      setStepActive(stepGenerate);

      const minTCs = parseInt(metaMinTCs.value, 10) || 10;
      const currentFeatures = getFeatures();
      let testCases;
      const warnings = [];

      if (currentFeatures.length > 0) {
        // Multi-pass: one call per feature with filtered text
        const allTCs = [];
        for (let i = 0; i < currentFeatures.length; i++) {
          const feature = currentFeatures[i];
          stepGenerate.querySelector('span').textContent =
            `Generando test cases... (feature ${i + 1} de ${currentFeatures.length}: ${feature})`;

          const filteredText = extractRelevantText(extractedText, feature, { targetChars: 12_000 });

          try {
            const tcs = await generateTestCases(
              CONFIG.workerUrl,
              val(tokenInput),
              filteredText,
              (partial) => {
                stepGenerate.querySelector('span').textContent =
                  `Generando test cases... (feature ${i + 1} de ${currentFeatures.length}: ${feature} — ${partial.length} chars)`;
              },
              minTCs,
              feature
            );
            allTCs.push(...tcs);
          } catch (err) {
            warnings.push(`No se pudieron generar TCs para: ${feature}`);
            console.warn(`Feature "${feature}" failed:`, err);
          }
        }

        if (allTCs.length === 0) {
          throw new Error('No se pudieron generar test cases para ninguna feature');
        }

        // Renumber TC IDs sequentially
        allTCs.forEach((tc, i) => {
          tc.tc_id = `TC-${String(i + 1).padStart(2, '0')}`;
        });

        testCases = allTCs;
      } else {
        // Single pass: original behavior
        testCases = await generateTestCases(
          CONFIG.workerUrl,
          val(tokenInput),
          extractedText,
          (partial) => {
            stepGenerate.querySelector('span').textContent =
              `Generando test cases... (${partial.length} caracteres)`;
          },
          minTCs
        );
      }

      stepGenerate.querySelector('span').textContent = 'Generando test cases...';
      setStepDone(stepGenerate);

      // Show warnings for partial failures
      if (warnings.length > 0) {
        warningMsg.textContent = warnings.join(' | ');
        warningMsg.classList.remove('hidden');
      }

      // --- Step 3: Build Excel ---
      setStepActive(stepExcel);

      const cfg = buildUATConfig({
        projectName: val(metaProject),
        client: val(metaClient),
        consultant: val(metaConsultant),
        dateValue: metaDate.value,
        locale: CONFIG.dateLocale,
        dateOptions: CONFIG.dateOptions,
        headerColor: CONFIG.defaultHeaderColor,
        testCases,
      });

      generatedWorkbook = await generateUATWorkbook(cfg);
      generatedFilename = `UAT_Report_${cfg.project_name.replace(/\s+/g, '_')}.xlsx`;

      setStepDone(stepExcel);

      // --- Show result ---
      const areas = [...new Set(testCases.map(tc => tc.area))];
      resultStats.textContent = `${testCases.length} test cases \u00B7 ${areas.length} áreas funcionales`;
      result.classList.remove('hidden');

    } catch (err) {
      const activeStep = document.querySelector('.progress-step.active');
      if (activeStep) setStepError(activeStep);
      showError(err.message);
      console.error(err);
    } finally {
      validateForm();
    }
  }

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------
  btnDownload.addEventListener('click', async () => {
    if (!generatedWorkbook) return;

    const buffer = await generatedWorkbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedFilename;
    a.click();
    URL.revokeObjectURL(url);
    generatedWorkbook = null;
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', init);
})();
