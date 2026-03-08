// ==UserScript==
// @name         Importar Calificaciones - Educarecuador (Bootstrap Professional)
// @namespace    http://tampermonkey.net/
// @version      20.5
// @description  Importar automático - Búsqueda global por página + Sin toasts distractores + Optimizado + Modal externo oculto permanente + Limpieza final + Refresh al finalizar
// @author       Tú
// @match        https://academico.educarecuador.gob.ec/*
// @match        *://*.educarecuador.gob.ec/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 Script v20.5 - Optimizado + Toasts selectivos + Modal externo oculto permanente + Limpieza final + Refresh automático');

    // ==========================================
    // VARIABLES GLOBALES
    // ==========================================
    let calificaciones = [];
    let indiceActual = 0;
    let procesoPausado = false;
    let cleanupRealizado = false;
    let filasPendientesGuardar = [];
    let paginaActual = 1;
    let autoPaginacionActiva = false;
    let contadorMigrados = 0;
    let contadorNoMigrados = 0;
    let datosInternos = null;
    let calificacionesProcesadas = new Set();

    // ==========================================
    // 🔹 INYECTAR CSS PARA OCULTAR MODAL EXTERNO (PERMANENTE)
    // ==========================================
    function inyectarCSSEstil() {
        if (document.getElementById('estilo-ocultar-modal-externo')) return;

        const estilo = document.createElement('style');
        estilo.id = 'estilo-ocultar-modal-externo';
        estilo.textContent = `
            /* Ocultar elementos que contengan texto de guardado */
            .modal-guardado, [class*="guardado"], [class*="saved"],
            div.modal-content:has-text("DATOS GUARDADOS"),
            div.alert:has-text("GUARDADO"),
            .toast:has-text("GUARDADO") {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(estilo);
        console.log('🎨 CSS inyectado para ocultar modal externo');
    }

    // ==========================================
    // 🔹 OBSERVER PARA OCULTAR MODAL DINÁMICO
    // ==========================================
    function iniciarObserverModal() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        ocultarSiEsModalGuardado(node);
                        node.querySelectorAll?.('div, .modal, .alert, .toast, [role="dialog"]').forEach(el => {
                            ocultarSiEsModalGuardado(el);
                        });
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log('👁️ Observer iniciado para detectar modales dinámicos');
    }

    // ==========================================
    // 🔹 OCULTAR ELEMENTO SI CONTIENE TEXTO DE GUARDADO
    // ==========================================
    function ocultarSiEsModalGuardado(elemento) {
        if (!elemento || !elemento.textContent) return;

        const texto = elemento.textContent.toLowerCase();
        const esModalGuardado =
            texto.includes('datos guardados') ||
            texto.includes('guardado correctamente') ||
            texto.includes('registro guardado') ||
            texto.includes('saved successfully') ||
            texto.includes('éxito al guardar') ||
            texto.includes('almacenado');

        if (esModalGuardado && elemento.offsetParent !== null) {
            if (!elemento.dataset.modalOculto) {
                elemento.dataset.modalOculto = 'true';
                elemento.dataset.originalDisplay = elemento.style.display || '';
                elemento.style.display = 'none';
                elemento.style.visibility = 'hidden';
                elemento.style.opacity = '0';
                elemento.setAttribute('aria-hidden', 'true');
                console.log('👻 Modal externo ocultado en tiempo real:', elemento.tagName);
            }
        }
    }

    // ==========================================
    // 🔹 FUNCIÓN AUXILIAR: COMPARAR CÉDULAS
    // ==========================================
    function compararCedulas(cedulaBuscada, textoCelda) {
        if (!cedulaBuscada || !textoCelda) return false;
        const a = cedulaBuscada.toString().replace(/\s+/g, '').trim();
        const b = textoCelda.toString().replace(/\s+/g, '').trim();
        return a === b;
    }

    // ==========================================
    // 🔹 CERRAR/OCULTAR MODAL EXTERNO (MODO FANTASMA)
    // ==========================================
    async function cerrarModalConfirmacion() {
        try {
            await esperar(150);

            const btnAceptar = Array.from(document.querySelectorAll('button')).find(btn => {
                const txt = btn.textContent.trim().toLowerCase();
                const visible = btn.offsetParent !== null;
                return visible && (txt === 'aceptar' || txt === 'ok' || txt === 'cerrar' || txt === 'listo');
            });

            if (btnAceptar) {
                btnAceptar.click();
                await esperar(100);
            }

            const elementosAEsconder = Array.from(document.querySelectorAll(
                'div.modal, .alert, .toast, [role="dialog"], div[class*="modal"], ' +
                'div[class*="alert"], div[class*="toast"], .modal-dialog, .modal-content'
            )).filter(el => {
                const texto = el.textContent.toLowerCase();
                const visible = el.offsetParent !== null &&
                               !el.matches('[style*="display: none"]') &&
                               !el.matches('[style*="visibility: hidden"]');
                return visible && (
                    texto.includes('datos guardados') ||
                    texto.includes('guardado correctamente') ||
                    texto.includes('registro guardado') ||
                    texto.includes('saved successfully') ||
                    texto.includes('éxito al guardar')
                );
            });

            elementosAEsconder.forEach(el => {
                if (!el.dataset.originalDisplay) {
                    el.dataset.originalDisplay = el.style.display || '';
                    el.dataset.originalVisibility = el.style.visibility || '';
                    el.dataset.originalOpacity = el.style.opacity || '';
                }
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                el.style.opacity = '0';
                el.setAttribute('aria-hidden', 'true');
            });

            const toastsGuardado = Array.from(document.querySelectorAll('.toast, .alert, [class*="toast"], [class*="alert"]')).filter(el => {
                return el.textContent.toLowerCase().includes('guardado') &&
                       el.offsetParent !== null;
            });
            toastsGuardado.forEach(el => {
                if (!el.dataset.originalDisplay) {
                    el.dataset.originalDisplay = el.style.display || '';
                }
                el.style.display = 'none';
            });

            return elementosAEsconder.length > 0 || toastsGuardado.length > 0;

        } catch (e) {
            console.warn('⚠️ Error ocultando modal externo (no crítico):', e);
            return false;
        }
    }

    // ==========================================
    // 🔹 LIMPIEZA FINAL REFORZADA DE MODALES (NUEVO)
    // ==========================================
    async function limpiezaFinalModales() {
        console.log('🧹 Ejecutando limpieza final de modales...');

        await esperar(500);

        const btnFinal = Array.from(document.querySelectorAll('button')).find(btn => {
            const txt = btn.textContent.trim().toLowerCase();
            const visible = btn.offsetParent !== null;
            return visible && (txt === 'aceptar' || txt === 'ok' || txt === 'cerrar' || txt === 'listo' || txt === 'continuar');
        });

        if (btnFinal) {
            btnFinal.click();
            console.log('✅ Botón final clickeado');
            await esperar(200);
        }

        const todosElementos = Array.from(document.querySelectorAll(
            'div.modal, .alert, .toast, [role="dialog"], div[class*="modal"], ' +
            'div[class*="alert"], div[class*="toast"], .modal-dialog, .modal-content, ' +
            '.modal-backdrop, .fade.show'
        ));

        todosElementos.forEach(el => {
            const texto = el.textContent.toLowerCase();
            if (texto.includes('guardado') ||
                texto.includes('datos') ||
                texto.includes('éxito') ||
                texto.includes('exito') ||
                texto.includes('saved') ||
                texto.includes('correctamente')) {

                if (el.offsetParent !== null) {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.style.opacity = '0';
                    el.setAttribute('aria-hidden', 'true');
                    console.log('👻 Modal final ocultado:', el.tagName);
                }
            }
        });

        document.querySelectorAll('.modal-backdrop, .backdrop').forEach(backdrop => {
            backdrop.style.display = 'none';
            backdrop.remove();
        });

        console.log('✅ Limpieza final completada');
    }

    // ==========================================
    // ARRASTRAR PANEL
    // ==========================================
    function hacerArrastrable() {
        const panel = document.getElementById('importador-educarecuador');
        const header = document.getElementById('panelHeader');
        if (!panel || !header) return;
        let isDragging = false, startX, startY, initialLeft, initialTop;
        header.addEventListener('mousedown', function(e) {
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;
            panel.style.cursor = 'grabbing';
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            panel.style.left = (initialLeft + e.clientX - startX) + 'px';
            panel.style.top = (initialTop + e.clientY - startY) + 'px';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', function() {
            isDragging = false;
            panel.style.cursor = 'default';
        });
    }

    // ==========================================
    // CREAR PANEL - BOOTSTRAP PROFESSIONAL COLORS
    // ==========================================
    function crearBotonFlotante() {
        if (document.getElementById('importador-educarecuador')) return;
        const container = document.createElement('div');
        container.id = 'importador-educarecuador';
        container.style.cssText = 'position: fixed; top: 100px; right: 20px; z-index: 99999;';
        container.innerHTML = `
            <div style="
                background: #C8C8C8; border: 1px solid #dee2e6; border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1); color: #212529;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                min-width: 420px; max-width: 470px;
            ">
                <div id="panelHeader" style="
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 16px; background: #adb5bd; color: white;
                    border-radius: 8px 8px 0 0; cursor: move;
                ">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600; user-select: none; color: white;">
                       🚀 Importador de Calificaciones
                    </h3>
                    <div style="display:flex;gap:6px;">
                        <button id="btnReset" title="Limpiar" style="
                            background: rgba(255,255,255,0.2); border:none; color:white;
                            width:30px; height:30px; border-radius:4px; cursor:pointer;
                            font-size:14px; transition: all 0.2s;"
                            onmouseover="this.style.background='rgba(255,255,255,0.3)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.2)'">🧹</button>
                        <button id="btnCerrarPanel" style="
                            background: rgba(255,255,255,0.2); border:none; color:white;
                            width:30px; height:30px; border-radius:4px; cursor:pointer;
                            font-size:16px; transition: all 0.2s;"
                            onmouseover="this.style.background='rgba(255,255,255,0.3)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.2)'">×</button>
                    </div>
                </div>
                <div style="padding: 20px;">
                    <div style="
                        background: #fafafa; border: 1px solid #9ec5fe; border-left: 4px solid #adb5bd;
                        padding: 12px; border-radius: 6px; margin-bottom: 16px;
                        font-size: 13px; line-height: 1.6; color: #055160;
                    ">
                        <strong style="color: #084298;">🔐 Modo Seguro:</strong><br>
                        1. Copie los datos de www.webprosistem.com<br>
                        1. VERIFIQUE que se encuentre en el trimestre correspondiente<br>
                        2. Haga clic en "▶ NICIAR IMPORTACIÓN"<br>
                        3. El script leerá directamente de su portapapeles<br>
                        <small style="opacity:0.85;">💡 Asegúrese de tener los datos copiados antes de iniciar</small>
                    </div>
                    <button id="btnIniciarImport" style="
                        width: 100%; padding: 12px; background: #ffc107; color: #212529;
                        border: none; border-radius: 6px; font-weight: 600; font-size: 15px;
                        cursor: pointer; margin-bottom: 10px; transition: all 0.2s;
                        box-shadow: 0 2px 4px rgba(255,193,7,0.2);"
                        onmouseover="this.style.background='#ffca2c'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(255,193,7,0.3)'"
                        onmouseout="this.style.background='#ffc107'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(255,193,7,0.2)'">
                        ▶ INICIAR IMPORTACIÓN
                    </button>
                    <button id="btnContinuar" style="
                        width: 100%; padding: 12px; background: #0d6efd; color: white;
                        border: none; border-radius: 6px; font-weight: 600; font-size: 15px;
                        cursor: pointer; margin-bottom: 10px; display: none;
                        transition: all 0.2s; box-shadow: 0 2px 4px rgba(13,110,253,0.2);"
                        onmouseover="this.style.background='#0b5ed7'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(13,110,253,0.3)'"
                        onmouseout="this.style.background='#0d6efd'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(13,110,253,0.2)'">
                        ⏭ CONTINUAR
                    </button>
                    <button id="btnFinalizar" style="
                        width: 100%; padding: 12px; background: #dc3545; color: white;
                        border: none; border-radius: 6px; font-weight: 600; font-size: 15px;
                        cursor: pointer; margin-bottom: 10px; display: none;
                        transition: all 0.2s; box-shadow: 0 2px 4px rgba(220,53,69,0.2);"
                        onmouseover="this.style.background='#bb2d3b'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(220,53,69,0.3)'"
                        onmouseout="this.style.background='#dc3545'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(220,53,69,0.2)'">
                        PROCESO FINALIZADO
                    </button>
                    <div id="progresoContainer" style="display: none; margin-top: 16px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; font-weight:500; color:#495057;">
                            <span id="progresoTexto">Progreso...</span>
                            <span id="progresoPorcentaje" style="color:#0d6efd; font-weight:600;">0%</span>
                        </div>
                        <div style="width:100%;height:20px;background:#e9ecef;border-radius:10px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.1);">
                            <div id="barraProgreso" style="width:0%;height:100%;background:linear-gradient(90deg, #198754 0%, #20c997 100%);transition:width 0.3s ease;"></div>
                        </div>
                    </div>
                    <div id="estadoContainer" style="
                        margin-top: 16px; padding: 12px; border-radius: 6px;
                        font-size: 14px; font-weight: 500; text-align: center;
                        display: none; transition: all 0.3s ease; border: 1px solid transparent;
                    ">
                        <span id="estadoTexto">Esperando...</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        document.getElementById('btnCerrarPanel').onclick = function() {
            procesoPausado = true; autoPaginacionActiva = false; cleanupRealizado = true;
            container.remove();
        };
        document.getElementById('btnReset').onclick = forzarLimpieza;
        document.getElementById('btnIniciarImport').onclick = iniciarImportacionAuto;
        document.getElementById('btnContinuar').onclick = continuarProceso;
        // 🔹 MODIFICADO: Ahora hace refresh después de limpiar
        document.getElementById('btnFinalizar').onclick = function() {
            forzarLimpieza(true); // true = con refresh
        };
        setTimeout(hacerArrastrable, 300);
    }

    // ==========================================
    // TOAST NOTIFICATION - Bootstrap Colors (SOLO PARA ERRORES DE ESTUDIANTE)
    // ==========================================
    function showToast(mensaje, tipo = 'error') {
        if (tipo !== 'error' || !mensaje.includes('NO MIGRADO')) return;

        const toast = document.createElement('div');
        const existingToasts = document.querySelectorAll('.toast-nm');
        const topOffset = 20 + (existingToasts.length * 65);
        toast.className = 'toast-nm';

        const bgColor = '#f8d7da', borderColor = '#f5c2c7', textColor = '#842029', icon = '❌';

        toast.style.cssText = `
            position: fixed; top: ${topOffset}px; right: 20px; z-index: 100000;
            padding: 14px 20px; border-radius: 8px; background: ${bgColor};
            border: 1px solid ${borderColor}; color: ${textColor};
            font-weight: 500; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.3s ease; opacity: 0; transform: translateX(50px);
            max-width: 380px; word-wrap: break-word; display: flex; align-items: center; gap: 10px;
        `;
        toast.innerHTML = `<span style="font-size:18px;">${icon}</span><span>${mensaje}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1'; toast.style.transform = 'translateX(0)';
        });
        setTimeout(() => {
            toast.style.opacity = '0'; toast.style.transform = 'translateX(50px)';
            setTimeout(() => { toast.remove(); reajustarToasts(); }, 300);
        }, 4000);
    }

    function reajustarToasts() {
        document.querySelectorAll('.toast-nm').forEach((toast, index) => {
            toast.style.top = (20 + index * 65) + 'px';
        });
    }

    // ==========================================
    // ACTUALIZAR ESTADO - Bootstrap Alert Colors
    // ==========================================
    function actualizarEstado(mensaje, tipo) {
        const estadoContainer = document.getElementById('estadoContainer');
        const estadoTexto = document.getElementById('estadoTexto');
        if (!estadoContainer || !estadoTexto) return;
        estadoContainer.style.display = 'block';
        estadoTexto.textContent = mensaje;
        const styles = {
            'escribiendo': {bg:'#fff3cd',bc:'#ffecb5',c:'#664d03'},
            'guardando': {bg:'#cfe2ff',bc:'#9ec5fe',c:'#084298'},
            'navegando': {bg:'#e2e3e5',bc:'#d3d6d8',c:'#41464b'},
            'success': {bg:'#d1e7dd',bc:'#badbcc',c:'#0f5132'},
            'error': {bg:'#f8d7da',bc:'#f5c2c7',c:'#842029'},
            'warning': {bg:'#fff3cd',bc:'#ffecb5',c:'#664d03'}
        };
        const s = styles[tipo] || {bg:'#e9ecef',bc:'#dee2e6',c:'#495057'};
        estadoContainer.style.background = s.bg;
        estadoContainer.style.borderColor = s.bc;
        estadoContainer.style.color = s.c;
    }

    // ==========================================
    // ACTUALIZAR BARRA DE PROGRESO
    // ==========================================
    function actualizarBarraProgreso(actual, total) {
        const container = document.getElementById('progresoContainer');
        const barra = document.getElementById('barraProgreso');
        const texto = document.getElementById('progresoTexto');
        const porcentaje = document.getElementById('progresoPorcentaje');
        if (!container || !barra) return;
        container.style.display = 'block';
        const pct = Math.round((actual / total) * 100);
        barra.style.width = pct + '%';
        texto.textContent = `Registro ${actual} de ${total}`;
        porcentaje.textContent = pct + '%';
    }

    // ==========================================
    // INICIAR IMPORTACIÓN
    // ==========================================
    async function iniciarImportacionAuto() {
        let texto = '';
        try {
            if (navigator.clipboard?.readText) texto = await navigator.clipboard.readText();
        } catch (e) { console.log('⚠️ No se pudo leer del portapapeles:', e.message); }
        if (!texto || texto.trim() === '') {
            showToast('❌ Copie las calificaciones de www.webprosistem.com antes de iniciar', 'error');
            return;
        }
        try { calificaciones = JSON.parse(texto); }
        catch (e) { showToast('❌ Error JSON: ' + e.message, 'error'); return; }
        if (!calificaciones?.length) { showToast('❌ No hay datos', 'error'); return; }
        if (!calificaciones[0].cedula) { showToast('❌ Falta campo "cedula"', 'error'); return; }

        calificaciones = calificaciones.map(est => ({
            ...est,
            cedula: (est.cedula || '').toString().replace(/\s+/g, ''),
            id: (est.id || '').toString().replace(/\s+/g, '')
        }));

        indiceActual = 0; paginaActual = 1; procesoPausado = false;
        autoPaginacionActiva = true; cleanupRealizado = false;
        filasPendientesGuardar = []; contadorMigrados = 0; contadorNoMigrados = 0;
        calificacionesProcesadas.clear();

        document.getElementById('btnIniciarImport').style.display = 'none';
        document.getElementById('btnContinuar').style.display = 'none';
        document.getElementById('btnFinalizar').style.display = 'none';
        document.getElementById('progresoContainer').style.display = 'block';

        actualizarBarraProgreso(0, calificaciones.length);
        actualizarEstado('🔐 Datos cargados - Iniciando...', 'escribiendo');

        await procesarPaginaActual();
    }

    // ==========================================
    // 🔹 PROCESAR PÁGINA ACTUAL (BUSQUEDA GLOBAL)
    // ==========================================
    async function procesarPaginaActual() {
        const filas = document.querySelectorAll('table tbody tr');
        actualizarEstado('✏️ Escaneando página...', 'escribiendo');

        for (const fila of filas) {
            if (procesoPausado) break;
            if (fila.style.display === 'none' || fila.hidden) continue;

            let cedulaEnFila = null;
            for (const td of fila.querySelectorAll('td')) {
                const texto = td.textContent.trim();
                if (texto && /^\d{9,13}$/.test(texto.replace(/\D/g, ''))) {
                    cedulaEnFila = texto.replace(/\D/g, '');
                    break;
                }
            }
            if (!cedulaEnFila) continue;

            for (let i = 0; i < calificaciones.length; i++) {
                if (calificacionesProcesadas.has(i)) continue;
                const est = calificaciones[i];
                if (compararCedulas(est.cedula, cedulaEnFila)) {
                    try {
                        const resultado = await escribirNotaConFila(est, fila);
                        if (resultado.exito) {
                            filasPendientesGuardar.push(resultado.fila);
                            calificacionesProcesadas.add(i);
                            contadorMigrados++;
                            actualizarBarraProgreso(calificacionesProcesadas.size, calificaciones.length);
                        } else {
                            contadorNoMigrados++;
                            showToast(`❌ NO MIGRADO: ${est.estudiante || cedulaEnFila}`, 'error');
                        }
                    } catch (e) {
                        console.error('Error procesando:', e);
                        contadorNoMigrados++;
                        showToast(`❌ NO MIGRADO: ${est.estudiante || cedulaEnFila}`, 'error');
                    }
                    break;
                }
            }
            await esperar(150);
        }

        if (filasPendientesGuardar.length > 0) {
            actualizarEstado('💾 Guardando...', 'guardando');
            await guardarRegistrosAuto();
        }

        if (calificacionesProcesadas.size >= calificaciones.length) {
            actualizarEstado('✅ ¡Completado!', 'success');
            finalizarImportacionAuto();
        } else {
            await navegarPaginaSiguiente();
        }
    }

    // ==========================================
    // 🔹 ESCRIBIR NOTA CON FILA YA ENCONTRADA
    // ==========================================
    async function escribirNotaConFila(estudiante, fila) {
        fila.style.background = '#fff3cd';
        fila.style.transition = 'background 0.3s ease';
        const inputs = fila.querySelectorAll('input[type="text"], input[type="number"]');
        let inputNota = inputs.length > 0 ? inputs[inputs.length - 1] : null;
        if (!inputNota) { fila.style.background = ''; return { exito: false, fila: null }; }

        inputNota.focus(); inputNota.value = ''; await esperar(50);

        const notaStr = estudiante.nota.toString();
        for (const char of notaStr) {
            inputNota.value += char;
            await esperar(15);
        }

        inputNota.dispatchEvent(new Event('input', { bubbles: true }));
        inputNota.dispatchEvent(new Event('change', { bubbles: true }));
        inputNota.dispatchEvent(new Event('blur', { bubbles: true }));
        await esperar(100);
        fila.style.background = '#d1e7dd';
        return { exito: true, fila: fila, nota: estudiante.nota };
    }

    // ==========================================
    // 🔹 GUARDAR REGISTROS (GENÉRICO)
    // ==========================================
    async function guardarRegistrosAuto() {
        for (let i = 0; i < filasPendientesGuardar.length; i++) {
            const fila = filasPendientesGuardar[i];
            try {
                const btnGuardar = fila.querySelector('button') ||
                                  Array.from(document.querySelectorAll('button')).find(b =>
                                      b.textContent.toLowerCase().includes('guardar') ||
                                      b.textContent.toLowerCase().includes('save')
                                  );
                if (btnGuardar) {
                    btnGuardar.click();
                    await esperar(1200);
                    await cerrarModalConfirmacion();
                }
            } catch (e) { console.error('Error guardando:', e); }
            await esperar(200);
        }
        filasPendientesGuardar = [];
        await esperar(300);
        await cerrarModalConfirmacion();
    }

    // ==========================================
    // AUTO-PAGINACIÓN
    // ==========================================
    async function navegarPaginaSiguiente() {
        if (!autoPaginacionActiva) return;
        actualizarEstado('📄 Navegando página siguiente...', 'navegando');
        await esperar(500);

        let btnSiguiente = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent.toLowerCase().includes('siguiente') ||
            b.textContent.toLowerCase().includes('next') ||
            b.textContent.toLowerCase().includes('>')
        );
        if (!btnSiguiente) {
            btnSiguiente = document.querySelector('.pagination .next, .pagination-next, [aria-label="Next"]');
        }

        if (btnSiguiente && btnSiguiente.offsetParent !== null) {
            btnSiguiente.click();
            await esperar(1500);
            const filasNuevas = document.querySelectorAll('table tbody tr:not([style*="display:none"])');
            if (filasNuevas.length > 0) {
                paginaActual++;
                actualizarEstado(`✅ Página ${paginaActual} cargada`, 'success');
                await esperar(500);
                await procesarPaginaActual();
            } else { throw new Error('La tabla no se actualizó'); }
        } else {
            actualizarEstado('⚠️ No hay más páginas', 'warning');
            document.getElementById('btnContinuar').style.display = 'block';
            autoPaginacionActiva = false;
        }
    }

    // ==========================================
    // CONTINUAR MANUAL
    // ==========================================
    async function continuarProceso() {
        procesoPausado = false; autoPaginacionActiva = true;
        document.getElementById('btnContinuar').style.display = 'none';
        actualizarEstado('▶️ Continuando...', 'escribiendo');
        await esperar(500);
        await procesarPaginaActual();
    }

    // ==========================================
    // FINALIZAR (CON LIMPIEZA FINAL REFORZADA)
    // ==========================================
    async function finalizarImportacionAuto() {
        autoPaginacionActiva = false;
        procesoPausado = true;
        document.getElementById('btnFinalizar').style.display = 'block';

        await limpiezaFinalModales();

        setTimeout(() => { limpiarPortapapeles(); }, 300);
    }

    // ==========================================
    // LIMPIAR PORTAPAPELES
    // ==========================================
    async function limpiarPortapapeles() {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText('');
                console.log('🔐 Portapapeles limpiado por seguridad');
            }
        } catch (e) { console.log('⚠️ No se pudo limpiar el portapapeles:', e.message); }
    }

    // ==========================================
    // LIMPIEZA (CON REFRESH OPCIONAL)
    // ==========================================
    function forzarLimpieza(conRefresh = false) {
        if (cleanupRealizado) return;
        cleanupRealizado = true;
        autoPaginacionActiva = false;
        procesoPausado = true;
        indiceActual = 0;
        calificaciones = [];
        filasPendientesGuardar = [];
        contadorMigrados = 0;
        contadorNoMigrados = 0;
        datosInternos = null;
        calificacionesProcesadas.clear();
        document.getElementById('progresoContainer').style.display = 'none';
        document.getElementById('estadoContainer').style.display = 'none';
        document.getElementById('btnContinuar').style.display = 'none';
        document.getElementById('btnFinalizar').style.display = 'none';
        const btnIniciar = document.getElementById('btnIniciarImport');
        if (btnIniciar) {
            btnIniciar.style.display = 'block';
            btnIniciar.disabled = false;
            btnIniciar.textContent = '▶️ NUEVA IMPORTACIÓN';
            btnIniciar.style.background = '#ffc107';
            btnIniciar.style.color = '#212529';
        }

        // 🔹 REFRESH AUTOMÁTICO SI SE SOLICITA
        if (conRefresh) {
            console.log('🔄 Refresh de página en 1 segundo...');
            actualizarEstado('🔄 Actualizando página...', 'success');
            setTimeout(() => {
                location.reload();
            }, 1000);
        }
    }

    // ==========================================
    // UTILIDADES
    // ==========================================
    function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // ==========================================
    // INICIALIZAR
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                inyectarCSSEstil();
                iniciarObserverModal();
                crearBotonFlotante();
            }, 2000);
        });
    } else {
        setTimeout(() => {
            inyectarCSSEstil();
            iniciarObserverModal();
            crearBotonFlotante();
        }, 2000);
    }

})();
