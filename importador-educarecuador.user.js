// ==UserScript==
// @name         Importar Calificaciones - Educarecuador (Bootstrap Professional)
// @namespace    http://tampermonkey.net/
// @version      20.9
// @description  Importar automático - Búsqueda global + Toasts selectivos + Modal oculto + Validación trimestres + Refresh final + Paginación completa + Cédulas alfanuméricas
// @author       Tú
// @match        https://academico.educarecuador.gob.ec/*
// @match        *://*.educarecuador.gob.ec/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 Script v20.9 - Soporte cédulas alfanuméricas (letras y números)');

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
    let trimestrePagina = '';
    let trimestreJSON = '';

    // ==========================================
    // 🔹 INYECTAR CSS PARA OCULTAR MODAL EXTERNO
    // ==========================================
    function inyectarCSSEstil() {
        if (document.getElementById('estilo-ocultar-modal-externo')) return;
        const estilo = document.createElement('style');
        estilo.id = 'estilo-ocultar-modal-externo';
        estilo.textContent = `
            .modal-guardado, [class*="guardado"], [class*="saved"],
            div.modal-content:has-text("DATOS GUARDADOS"),
            div.alert:has-text("GUARDADO"), .toast:has-text("GUARDADO") {
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
                console.log('👻 Modal externo ocultado:', elemento.tagName);
            }
        }
    }

    // ==========================================
    // 🔹 FUNCIÓN AUXILIAR: COMPARAR CÉDULAS (ALFANUMÉRICAS)
    // ==========================================
    function compararCedulas(cedulaBuscada, textoCelda) {
        if (!cedulaBuscada || !textoCelda) return false;

        // ✅ Normalizar: convertir a mayúsculas, quitar espacios y caracteres especiales
        const a = cedulaBuscada.toString().toUpperCase().replace(/[\s\-\.]/g, '').trim();
        const b = textoCelda.toString().toUpperCase().replace(/[\s\-\.]/g, '').trim();

        // ✅ Comparación exacta (acepta letras y números)
        return a === b;
    }

    // ==========================================
    // 🔹 DETECTAR CÉDULA EN CELDA (ALFANUMÉRICA)
    // ==========================================
    function detectarCedulaEnTexto(texto) {
        if (!texto) return null;

        // ✅ Patrón que acepta letras y números (mínimo 5 caracteres, máximo 20)
        // Ejemplos válidos: 1712345678, A123456789, 1234567890123, ABC123456, etc.
        const patrones = [
            /^[A-Z0-9]{5,20}$/i,           // Alfanumérico puro (5-20 caracteres)
            /^[A-Z]{1,3}[0-9]{6,15}$/i,    // Letras + números (ej: A123456789)
            /^[0-9]{6,15}[A-Z]{0,3}$/i,    // Números + letras (ej: 1712345678A)
        ];

        const textoLimpio = texto.toString().toUpperCase().replace(/[\s\-\.]/g, '').trim();

        // ✅ Verificar si coincide con algún patrón
        for (const patron of patrones) {
            if (patron.test(textoLimpio)) {
                return textoLimpio;
            }
        }

        // ✅ Si no coincide con patrones estrictos, pero tiene longitud razonable y no es texto común
        if (textoLimpio.length >= 5 && textoLimpio.length <= 20 && /[0-9]/.test(textoLimpio)) {
            return textoLimpio;
        }

        return null;
    }

    // ==========================================
    // 🔹 LEER TRIMESTRE DE LA PÁGINA
    // ==========================================
    function leerTrimestrePagina() {
        try {
            const posiblesSelectores = [
                'h3.text-center.fw-bold', 'h3[class*="fw-bold"]',
                '.text-center.fw-bold', '[class*="trimestre"]',
                '[class*="TRIMESTRE"]', 'h3'
            ];
            for (const selector of posiblesSelectores) {
                const elementos = document.querySelectorAll(selector);
                for (const el of elementos) {
                    const texto = el.textContent.trim().toUpperCase();
                    if (texto.includes('TRIMESTRE')) {
                        const match = texto.match(/TRIMESTRE\s*\d+/);
                        if (match) {
                            console.log('📅 Trimestre detectado:', match[0]);
                            return match[0];
                        }
                    }
                }
            }
            const todosElementos = document.querySelectorAll('*');
            for (const el of todosElementos) {
                const texto = el.textContent.trim().toUpperCase();
                if (texto.includes('TRIMESTRE')) {
                    const match = texto.match(/TRIMESTRE\s*\d+/);
                    if (match) return match[0];
                }
            }
            console.warn('⚠️ No se detectó trimestre en página');
            return '';
        } catch (e) {
            console.error('❌ Error leyendo trimestre:', e);
            return '';
        }
    }

    // ==========================================
    // 🔹 VALIDAR TRIMESTRES
    // ==========================================
    function validarTrimestres(trimestreJSON, trimestrePagina) {
        if (!trimestreJSON || !trimestrePagina) {
            return { valido: false, mensaje: '⚠️ No se pudo detectar el trimestre.' };
        }
        const jsonNorm = trimestreJSON.toUpperCase().trim();
        const paginaNorm = trimestrePagina.toUpperCase().trim();
        const numeroJSON = jsonNorm.match(/\d+/)?.[0] || '';
        const numeroPagina = paginaNorm.match(/\d+/)?.[0] || '';

        if (numeroJSON && numeroPagina && numeroJSON === numeroPagina) {
            return { valido: true, mensaje: `Trimestres coinciden: ${trimestrePagina}` };
        }
        return { valido: false, mensaje: `❌ TRIMESTRES NO COINCIDEN - ${trimestreJSON} | Página: ${trimestrePagina}` };
    }

    // ==========================================
    // 🔹 CERRAR/OCULTAR MODAL EXTERNO
    // ==========================================
    async function cerrarModalConfirmacion() {
        try {
            await esperar(150);
            const btnAceptar = Array.from(document.querySelectorAll('button')).find(btn => {
                const txt = btn.textContent.trim().toLowerCase();
                const visible = btn.offsetParent !== null;
                return visible && (txt === 'aceptar' || txt === 'ok' || txt === 'cerrar' || txt === 'listo');
            });
            if (btnAceptar) { btnAceptar.click(); await esperar(100); }

            const elementosAEsconder = Array.from(document.querySelectorAll(
                'div.modal, .alert, .toast, [role="dialog"], div[class*="modal"], ' +
                'div[class*="alert"], div[class*="toast"], .modal-dialog, .modal-content'
            )).filter(el => {
                const texto = el.textContent.toLowerCase();
                const visible = el.offsetParent !== null &&
                               !el.matches('[style*="display: none"]') &&
                               !el.matches('[style*="visibility: hidden"]');
                return visible && (texto.includes('datos guardados') || texto.includes('guardado correctamente') || texto.includes('registro guardado') || texto.includes('saved successfully') || texto.includes('éxito al guardar'));
            });
            elementosAEsconder.forEach(el => {
                if (!el.dataset.originalDisplay) {
                    el.dataset.originalDisplay = el.style.display || '';
                    el.dataset.originalVisibility = el.style.visibility || '';
                    el.dataset.originalOpacity = el.style.opacity || '';
                }
                el.style.display = 'none'; el.style.visibility = 'hidden';
                el.style.opacity = '0'; el.setAttribute('aria-hidden', 'true');
            });
            const toastsGuardado = Array.from(document.querySelectorAll('.toast, .alert, [class*="toast"], [class*="alert"]')).filter(el => el.textContent.toLowerCase().includes('guardado') && el.offsetParent !== null);
            toastsGuardado.forEach(el => { if (!el.dataset.originalDisplay) el.dataset.originalDisplay = el.style.display || ''; el.style.display = 'none'; });
            return elementosAEsconder.length > 0 || toastsGuardado.length > 0;
        } catch (e) { console.warn('⚠️ Error ocultando modal:', e); return false; }
    }

    // ==========================================
    // 🔹 LIMPIEZA FINAL DE MODALES
    // ==========================================
    async function limpiezaFinalModales() {
        console.log('🧹 Limpieza final de modales...');
        await esperar(500);
        const btnFinal = Array.from(document.querySelectorAll('button')).find(btn => {
            const txt = btn.textContent.trim().toLowerCase();
            const visible = btn.offsetParent !== null;
            return visible && (txt === 'aceptar' || txt === 'ok' || txt === 'cerrar' || txt === 'listo' || txt === 'continuar');
        });
        if (btnFinal) { btnFinal.click(); console.log('✅ Botón final clickeado'); await esperar(200); }
        const todosElementos = Array.from(document.querySelectorAll('div.modal, .alert, .toast, [role="dialog"], div[class*="modal"], div[class*="alert"], div[class*="toast"], .modal-dialog, .modal-content, .modal-backdrop, .fade.show'));
        todosElementos.forEach(el => {
            const texto = el.textContent.toLowerCase();
            if (texto.includes('guardado') || texto.includes('datos') || texto.includes('éxito') || texto.includes('exito') || texto.includes('saved') || texto.includes('correctamente')) {
                if (el.offsetParent !== null) { el.style.display = 'none'; el.style.visibility = 'hidden'; el.style.opacity = '0'; el.setAttribute('aria-hidden', 'true'); }
            }
        });
        document.querySelectorAll('.modal-backdrop, .backdrop').forEach(b => { b.style.display = 'none'; b.remove(); });
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
            isDragging = true; startX = e.clientX; startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;
            panel.style.cursor = 'grabbing'; e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            panel.style.left = (initialLeft + e.clientX - startX) + 'px';
            panel.style.top = (initialTop + e.clientY - startY) + 'px';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', function() { isDragging = false; panel.style.cursor = 'default'; });
    }

    // ==========================================
    // CREAR PANEL
    // ==========================================
    function crearBotonFlotante() {
        if (document.getElementById('importador-educarecuador')) return;
        const container = document.createElement('div');
        container.id = 'importador-educarecuador';
        container.style.cssText = 'position: fixed; top: 100px; right: 20px; z-index: 99999;';
        container.innerHTML = `
            <div style="background: #C8C8C8; border: 1px solid #dee2e6; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); color: #212529; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; min-width: 420px; max-width: 470px;">
                <div id="panelHeader" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #adb5bd; color: white; border-radius: 8px 8px 0 0; cursor: move;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600; user-select: none; color: white;">📊 Importador de Calificaciones</h3>
                    <div style="display:flex;gap:6px;">
                        <button id="btnReset" title="Limpiar" style="background: rgba(255,255,255,0.2); border:none; color:white; width:30px; height:30px; border-radius:4px; cursor:pointer; font-size:14px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">🧹</button>
                        <button id="btnCerrarPanel" style="background: rgba(255,255,255,0.2); border:none; color:white; width:30px; height:30px; border-radius:4px; cursor:pointer; font-size:16px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">×</button>
                    </div>
                </div>
                <div style="padding: 20px;">
                    <div style="background: #fafafa; border: 1px solid #9ec5fe; border-left: 4px solid #adb5bd; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; line-height: 1.6; color: #055160;">
                        <strong style="color: #084298;">🔐 Modo Seguro:</strong><br>1. Copie datos de www.webprosistem.com<br>2. Click en "▶ INICIAR IMPORTACIÓN"<br>3. El script leerá del portapapeles<br><small style="opacity:0.85;">💡 Copie los datos antes de iniciar</small>
                    </div>
                    <button id="btnIniciarImport" style="width: 100%; padding: 12px; background: #ffc107; color: #212529; border: none; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 10px; transition: all 0.2s; box-shadow: 0 2px 4px rgba(255,193,7,0.2);" onmouseover="this.style.background='#ffca2c'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(255,193,7,0.3)'" onmouseout="this.style.background='#ffc107'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(255,193,7,0.2)'">▶ INICIAR IMPORTACIÓN</button>
                    <button id="btnContinuar" style="width: 100%; padding: 12px; background: #0d6efd; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 10px; display: none; transition: all 0.2s; box-shadow: 0 2px 4px rgba(13,110,253,0.2);" onmouseover="this.style.background='#0b5ed7'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(13,110,253,0.3)'" onmouseout="this.style.background='#0d6efd'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(13,110,253,0.2)'">⏭ CONTINUAR</button>
                    <button id="btnFinalizar" style="width: 100%; padding: 12px; background: #dc3545; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 10px; display: none; transition: all 0.2s; box-shadow: 0 2px 4px rgba(220,53,69,0.2);" onmouseover="this.style.background='#bb2d3b'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(220,53,69,0.3)'" onmouseout="this.style.background='#dc3545'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(220,53,69,0.2)'">PROCESO FINALIZADO</button>
                    <div id="progresoContainer" style="display: none; margin-top: 16px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; font-weight:500; color:#495057;"><span id="progresoTexto">Progreso...</span><span id="progresoPorcentaje" style="color:#0d6efd; font-weight:600;">0%</span></div>
                        <div style="width:100%;height:20px;background:#e9ecef;border-radius:10px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.1);"><div id="barraProgreso" style="width:0%;height:100%;background:linear-gradient(90deg, #198754 0%, #20c997 100%);transition:width 0.3s ease;"></div></div>
                    </div>
                    <div id="estadoContainer" style="margin-top: 16px; padding: 12px; border-radius: 6px; font-size: 14px; font-weight: 500; text-align: center; display: none; transition: all 0.3s ease; border: 1px solid transparent;"><span id="estadoTexto">Esperando...</span></div>
                </div>
            </div>`;
        document.body.appendChild(container);
        document.getElementById('btnCerrarPanel').onclick = function() { procesoPausado = true; autoPaginacionActiva = false; cleanupRealizado = true; container.remove(); };
        document.getElementById('btnReset').onclick = forzarLimpieza;
        document.getElementById('btnIniciarImport').onclick = iniciarImportacionAuto;
        document.getElementById('btnContinuar').onclick = continuarProceso;
        document.getElementById('btnFinalizar').onclick = function() { forzarLimpieza(true); };
        setTimeout(hacerArrastrable, 300);
    }

    // ==========================================
    // TOAST NOTIFICATION (SOLO ERRORES)
    // ==========================================
    function showToast(mensaje, tipo = 'error') {
        if (tipo !== 'error' || !mensaje.includes('NO MIGRADO')) return;
        const toast = document.createElement('div');
        const existingToasts = document.querySelectorAll('.toast-nm');
        const topOffset = 20 + (existingToasts.length * 65);
        toast.className = 'toast-nm';
        const bgColor = '#f8d7da', borderColor = '#f5c2c7', textColor = '#842029', icon = '❌';
        toast.style.cssText = `position: fixed; top: ${topOffset}px; right: 20px; z-index: 100000; padding: 14px 20px; border-radius: 8px; background: ${bgColor}; border: 1px solid ${borderColor}; color: ${textColor}; font-weight: 500; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.3s ease; opacity: 0; transform: translateX(50px); max-width: 380px; word-wrap: break-word; display: flex; align-items: center; gap: 10px;`;
        toast.innerHTML = `<span style="font-size:18px;">${icon}</span><span>${mensaje}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(50px)'; setTimeout(() => { toast.remove(); reajustarToasts(); }, 300); }, 4000);
    }

    function showToastTrimestre(mensaje, tipo = 'error') {
        const toast = document.createElement('div');
        toast.className = 'toast-trimestre';
        const bgColor = tipo === 'error' ? '#f8d7da' : '#d1e7dd';
        const borderColor = tipo === 'error' ? '#f5c2c7' : '#badbcc';
        const textColor = tipo === 'error' ? '#842029' : '#0f5132';
        const icon = tipo === 'error' ? '❌' : '✅';
        toast.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 100001; padding: 16px 24px; border-radius: 8px; background: ${bgColor}; border: 1px solid ${borderColor}; color: ${textColor}; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.3s ease; opacity: 0; transform: translateX(50px); max-width: 450px; word-wrap: break-word; display: flex; align-items: center; gap: 12px;`;
        toast.innerHTML = `<span style="font-size:20px;">${icon}</span><span>${mensaje}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(50px)'; setTimeout(() => { toast.remove(); }, 300); }, 6000);
    }

    function reajustarToasts() {
        document.querySelectorAll('.toast-nm').forEach((toast, index) => { toast.style.top = (20 + index * 65) + 'px'; });
    }

    // ==========================================
    // ACTUALIZAR ESTADO
    // ==========================================
    function actualizarEstado(mensaje, tipo) {
        const estadoContainer = document.getElementById('estadoContainer');
        const estadoTexto = document.getElementById('estadoTexto');
        if (!estadoContainer || !estadoTexto) return;
        estadoContainer.style.display = 'block';
        estadoTexto.textContent = mensaje;
        const styles = { 'escribiendo': {bg:'#fff3cd',bc:'#ffecb5',c:'#664d03'}, 'guardando': {bg:'#cfe2ff',bc:'#9ec5fe',c:'#084298'}, 'navegando': {bg:'#e2e3e5',bc:'#d3d6d8',c:'#41464b'}, 'success': {bg:'#d1e7dd',bc:'#badbcc',c:'#0f5132'}, 'error': {bg:'#f8d7da',bc:'#f5c2c7',c:'#842029'}, 'warning': {bg:'#fff3cd',bc:'#ffecb5',c:'#664d03'} };
        const s = styles[tipo] || {bg:'#e9ecef',bc:'#dee2e6',c:'#495057'};
        estadoContainer.style.background = s.bg; estadoContainer.style.borderColor = s.bc; estadoContainer.style.color = s.c;
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
        try { if (navigator.clipboard?.readText) texto = await navigator.clipboard.readText(); }
        catch (e) { console.log('⚠️ No se pudo leer portapapeles:', e.message); }
        if (!texto || texto.trim() === '') { showToast('❌ Copie calificaciones de www.webprosistem.com', 'error'); return; }
        try { calificaciones = JSON.parse(texto); }
        catch (e) { showToast('❌ Error JSON: ' + e.message, 'error'); return; }
        if (!calificaciones?.length) { showToast('❌ No hay datos', 'error'); return; }
        if (!calificaciones[0].cedula) { showToast('❌ Falta campo "cedula"', 'error'); return; }

        // 🔹 VALIDACIÓN DE TRIMESTRES
        trimestreJSON = calificaciones[0].trimestre || '';
        trimestrePagina = leerTrimestrePagina();
        console.log('📅 Trimestre JSON:', trimestreJSON);
        console.log('📅 Trimestre Página:', trimestrePagina);
        const validacion = validarTrimestres(trimestreJSON, trimestrePagina);
        if (!validacion.valido) {
            showToastTrimestre(validacion.mensaje, 'error');
            actualizarEstado(validacion.mensaje, 'error');
            return;
        }
        showToastTrimestre(validacion.mensaje, 'success');
        await esperar(1500);

        // ✅ Normalizar cédulas (alfanuméricas)
        calificaciones = calificaciones.map(est => ({
            ...est,
            cedula: (est.cedula || '').toString().toUpperCase().replace(/[\s\-\.]/g, '').trim(),
            id: (est.id || '').toString().toUpperCase().replace(/[\s\-\.]/g, '').trim()
        }));

        indiceActual = 0; paginaActual = 1; procesoPausado = false; autoPaginacionActiva = true; cleanupRealizado = false;
        filasPendientesGuardar = []; contadorMigrados = 0; contadorNoMigrados = 0; calificacionesProcesadas.clear();
        document.getElementById('btnIniciarImport').style.display = 'none';
        document.getElementById('btnContinuar').style.display = 'none';
        document.getElementById('btnFinalizar').style.display = 'none';
        document.getElementById('progresoContainer').style.display = 'block';
        actualizarBarraProgreso(0, calificaciones.length);
        actualizarEstado('🔐 Datos cargados - Iniciando...', 'escribiendo');
        await procesarPaginaActual();
    }

    // ==========================================
    // PROCESAR PÁGINA ACTUAL
    // ==========================================
    async function procesarPaginaActual() {
        const filas = document.querySelectorAll('table tbody tr');
        actualizarEstado('✏️ Escaneando página ' + paginaActual + '...', 'escribiendo');
        for (const fila of filas) {
            if (procesoPausado) break;
            if (fila.style.display === 'none' || fila.hidden) continue;

            // 🔹 Buscar cédula en todas las celdas (ALFANUMÉRICA)
            let cedulaEnFila = null;
            for (const td of fila.querySelectorAll('td')) {
                const texto = td.textContent.trim();
                cedulaEnFila = detectarCedulaEnTexto(texto);
                if (cedulaEnFila) break;
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
                        } else { contadorNoMigrados++; showToast(`❌ NO MIGRADO: ${est.estudiante || cedulaEnFila}`, 'error'); }
                    } catch (e) { console.error('Error procesando:', e); contadorNoMigrados++; showToast(`❌ NO MIGRADO: ${est.estudiante || cedulaEnFila}`, 'error'); }
                    break;
                }
            }
            await esperar(150);
        }
        if (filasPendientesGuardar.length > 0) { actualizarEstado('💾 Guardando...', 'guardando'); await guardarRegistrosAuto(); }

        if (calificacionesProcesadas.size >= calificaciones.length) {
            actualizarEstado('✅ ¡Completado!', 'success');
            finalizarImportacionAuto();
        } else {
            await navegarPaginaSiguiente();
        }
    }

    // ==========================================
    // ESCRIBIR NOTA CON FILA
    // ==========================================
    async function escribirNotaConFila(estudiante, fila) {
        fila.style.background = '#fff3cd'; fila.style.transition = 'background 0.3s ease';
        const inputs = fila.querySelectorAll('input[type="text"], input[type="number"]');
        let inputNota = inputs.length > 0 ? inputs[inputs.length - 1] : null;
        if (!inputNota) { fila.style.background = ''; return { exito: false, fila: null }; }
        inputNota.focus(); inputNota.value = ''; await esperar(50);
        const notaStr = estudiante.nota.toString();
        for (const char of notaStr) { inputNota.value += char; await esperar(15); }
        inputNota.dispatchEvent(new Event('input', { bubbles: true }));
        inputNota.dispatchEvent(new Event('change', { bubbles: true }));
        inputNota.dispatchEvent(new Event('blur', { bubbles: true }));
        await esperar(100);
        fila.style.background = '#d1e7dd';
        return { exito: true, fila: fila, nota: estudiante.nota };
    }

    // ==========================================
    // GUARDAR REGISTROS
    // ==========================================
    async function guardarRegistrosAuto() {
        for (let i = 0; i < filasPendientesGuardar.length; i++) {
            const fila = filasPendientesGuardar[i];
            try {
                const btnGuardar = fila.querySelector('button') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('guardar') || b.textContent.toLowerCase().includes('save'));
                if (btnGuardar) { btnGuardar.click(); await esperar(1200); await cerrarModalConfirmacion(); }
            } catch (e) { console.error('Error guardando:', e); }
            await esperar(200);
        }
        filasPendientesGuardar = []; await esperar(300); await cerrarModalConfirmacion();
    }

    // ==========================================
    // AUTO-PAGINACIÓN
    // ==========================================
    async function navegarPaginaSiguiente() {
        if (!autoPaginacionActiva) return;

        if (paginaActual >= 10) {
            console.warn('⚠️ Límite de páginas alcanzado (10). Deteniendo.');
            actualizarEstado('⚠️ Límite de páginas alcanzado', 'warning');
            await esperar(1000);
            finalizarImportacionAuto();
            return;
        }

        actualizarEstado('📄 Navegando página ' + (paginaActual + 1) + '...', 'navegando');
        await esperar(800);

        let btnSiguiente = Array.from(document.querySelectorAll('button')).find(b => {
            const txt = b.textContent.trim().toLowerCase();
            const visible = b.offsetParent !== null;
            return visible && (txt.includes('siguiente') || txt.includes('next') || txt === '>' || txt.includes('»'));
        });

        if (!btnSiguiente) {
            btnSiguiente = document.querySelector('.pagination .next, .pagination-next, [aria-label="Next"]');
        }

        if (!btnSiguiente || btnSiguiente.offsetParent === null) {
            console.log('✅ No hay más páginas disponibles');
            actualizarEstado('✅ No hay más páginas', 'success');
            await esperar(500);

            if (calificacionesProcesadas.size >= calificaciones.length) {
                actualizarEstado('✅ ¡Completado!', 'success');
                finalizarImportacionAuto();
            } else {
                const faltantes = calificaciones.length - calificacionesProcesadas.size;
                actualizarEstado(`⚠️ Fin de páginas - Faltan ${faltantes} registros`, 'warning');
                console.warn(`⚠️ ${faltantes} registros no encontrados en ${paginaActual} páginas`);
                document.getElementById('btnContinuar').style.display = 'block';
                autoPaginacionActiva = false;
            }
            return;
        }

        btnSiguiente.click();
        console.log(`📄 Click en página siguiente (actual: ${paginaActual} → siguiente: ${paginaActual + 1})`);
        await esperar(2500);

        paginaActual++;
        console.log(`✅ Página ${paginaActual} cargada - Continuando búsqueda...`);
        actualizarEstado(`✅ Página ${paginaActual} cargada`, 'success');
        await esperar(500);
        await procesarPaginaActual();
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
    // FINALIZAR
    // ==========================================
    async function finalizarImportacionAuto() {
        autoPaginacionActiva = false; procesoPausado = true;
        document.getElementById('btnFinalizar').style.display = 'block';
        await limpiezaFinalModales();
        setTimeout(() => { limpiarPortapapeles(); }, 300);
    }

    // ==========================================
    // LIMPIAR PORTAPAPELES
    // ==========================================
    async function limpiarPortapapeles() {
        try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(''); console.log('🔐 Portapapeles limpiado'); } }
        catch (e) { console.log('⚠️ No se pudo limpiar portapapeles:', e.message); }
    }

    // ==========================================
    // LIMPIEZA
    // ==========================================
    function forzarLimpieza(conRefresh = false) {
        if (cleanupRealizado) return; cleanupRealizado = true;
        autoPaginacionActiva = false; procesoPausado = true; indiceActual = 0;
        calificaciones = []; filasPendientesGuardar = []; contadorMigrados = 0; contadorNoMigrados = 0;
        datosInternos = null; calificacionesProcesadas.clear();
        document.getElementById('progresoContainer').style.display = 'none';
        document.getElementById('estadoContainer').style.display = 'none';
        document.getElementById('btnContinuar').style.display = 'none';
        document.getElementById('btnFinalizar').style.display = 'none';
        const btnIniciar = document.getElementById('btnIniciarImport');
        if (btnIniciar) { btnIniciar.style.display = 'block'; btnIniciar.disabled = false; btnIniciar.textContent = '▶️ NUEVA IMPORTACIÓN'; btnIniciar.style.background = '#ffc107'; btnIniciar.style.color = '#212529'; }
        if (conRefresh) { console.log('🔄 Refresh en 1 segundo...'); actualizarEstado('🔄 Actualizando página...', 'success'); setTimeout(() => { location.reload(); }, 1000); }
    }

    // ==========================================
    // UTILIDADES
    // ==========================================
    function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // ==========================================
    // INICIALIZAR
    // ==========================================
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { inyectarCSSEstil(); iniciarObserverModal(); crearBotonFlotante(); }, 2000); }); }
    else { setTimeout(() => { inyectarCSSEstil(); iniciarObserverModal(); crearBotonFlotante(); }, 2000); }

})();
