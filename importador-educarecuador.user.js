// ==UserScript==
// @name         Importar Calificaciones - Educarecuador
// @namespace    http://tampermonkey.net/
// @version      21.7
// @description  Importar automático - Validación con coincidencia parcial flexible + Panel arrastrable
// @author       Tú
// @match        https://academico.educarecuador.gob.ec/*
// @match        *://*.educarecuador.gob.ec/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 Script v21.7 - Panel arrastrable + Coincidencia flexible');

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
    let asignaturaPagina = '';
    let asignaturaJSON = '';
    let validacionAsignaturaActiva = false;

    // ==========================================
    // 🔹 INYECTAR CSS
    // ==========================================
    function inyectarCSSEstil() {
        if (document.getElementById('estilo-ocultar-modal-externo')) return;
        const estilo = document.createElement('style');
        estilo.id = 'estilo-ocultar-modal-externo';
        estilo.textContent = `
            .modal-guardado, [class*="guardado"], [class*="saved"] {
                display: none !important;
            }
        `;
        document.head.appendChild(estilo);
    }

    // ==========================================
    // 🔹 OBSERVER MODAL
    // ==========================================
    function iniciarObserverModal() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        ocultarSiEsModalGuardado(node);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function ocultarSiEsModalGuardado(elemento) {
        if (!elemento || !elemento.textContent) return;
        const texto = elemento.textContent.toLowerCase();
        if (texto.includes('guardado') || texto.includes('datos guardados')) {
            elemento.style.display = 'none';
        }
    }

    // ==========================================
    // 🔹 COMPARAR CÉDULAS
    // ==========================================
    function compararCedulas(cedulaBuscada, textoCelda) {
        if (!cedulaBuscada || !textoCelda) return false;
        const a = cedulaBuscada.toString().toUpperCase().replace(/[\s\-\.]/g, '').trim();
        const b = textoCelda.toString().toUpperCase().replace(/[\s\-\.]/g, '').trim();
        return a === b;
    }

    // ==========================================
    // 🔹 DETECTAR CÉDULA
    // ==========================================
    function detectarCedulaEnTexto(texto) {
        if (!texto) return null;
        const patrones = [
            /^[A-Z0-9]{5,20}$/i,
            /^[A-Z]{1,3}[0-9]{6,15}$/i,
        ];
        const textoLimpio = texto.toString().toUpperCase().replace(/[\s\-\.]/g, '').trim();
        for (const patron of patrones) {
            if (patron.test(textoLimpio)) return textoLimpio;
        }
        return null;
    }

    // ==========================================
    // 🔹 NORMALIZAR TEXTO
    // ==========================================
    function normalizarTexto(texto) {
        if (!texto) return '';
        let resultado = texto.toString().toLowerCase();
        resultado = resultado.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        resultado = resultado.replace(/[^a-z0-9ñ\s]/g, '');
        resultado = resultado.replace(/\s+/g, ' ').trim();
        return resultado;
    }

    // ==========================================
    // 🔹 COINCIDENCIA FLEXIBLE
    // ==========================================
    function coincideAsignatura(asignaturaJSON, asignaturaPagina) {
        if (!asignaturaJSON || !asignaturaPagina) return false;

        const jsonNorm = normalizarTexto(asignaturaJSON);
        const paginaNorm = normalizarTexto(asignaturaPagina);

        console.log('🔍 Validación flexible:');
        console.log('  JSON:', jsonNorm);
        console.log('  Página:', paginaNorm);

        // ✅ MÉTODO 1: Coincidencia directa (includes)
        if (paginaNorm.includes(jsonNorm)) {
            console.log('  ✅ Coincidencia directa');
            return true;
        }

        // ✅ MÉTODO 2: Coincidencia por palabras clave
        const palabrasJSON = jsonNorm.split(' ').filter(p => p.length > 2);
        const palabrasPagina = paginaNorm.split(' ');

        let coincidencias = 0;
        palabrasJSON.forEach(palabra => {
            if (palabrasPagina.some(p => p.includes(palabra) || palabra.includes(p))) {
                coincidencias++;
            }
        });

        const porcentaje = coincidencias / palabrasJSON.length;
        console.log(`  📊 Coincidencias: ${coincidencias}/${palabrasJSON.length} (${Math.round(porcentaje * 100)}%)`);

        // ✅ Si al menos 70% de las palabras coinciden
        if (porcentaje >= 0.7) {
            console.log('  ✅ Coincidencia por palabras clave');
            return true;
        }

        console.log('  ❌ No hay coincidencia suficiente');
        return false;
    }

    // ==========================================
    // 🔹 LEER TRIMESTRE
    // ==========================================
    function leerTrimestrePagina() {
        const elementos = document.querySelectorAll('h3, [class*="trimestre"]');
        for (const el of elementos) {
            const texto = el.textContent.trim().toUpperCase();
            if (texto.includes('TRIMESTRE')) {
                const match = texto.match(/TRIMESTRE\s*\d+/);
                if (match) return match[0];
            }
        }
        return '';
    }

    // ==========================================
    // 🔹 LEER ASIGNATURA
    // ==========================================
    function leerAsignaturaPagina() {
        const legend = document.querySelector('legend.scheduler-border');
        if (legend && legend.textContent.trim().length > 3) {
            return legend.textContent.trim();
        }

        const legendGeneral = document.querySelector('legend');
        if (legendGeneral && legendGeneral.textContent.trim().length > 3) {
            return legendGeneral.textContent.trim();
        }

        return '';
    }

    // ==========================================
    // 🔹 VALIDAR TRIMESTRES
    // ==========================================
    function validarTrimestres(trimestreJSON, trimestrePagina) {
        if (!trimestreJSON || !trimestrePagina) {
            return { valido: false, mensaje: '⚠️ No se detectó el trimestre' };
        }
        const numeroJSON = trimestreJSON.match(/\d+/)?.[0] || '';
        const numeroPagina = trimestrePagina.match(/\d+/)?.[0] || '';
        if (numeroJSON && numeroPagina && numeroJSON === numeroPagina) {
            return { valido: true, mensaje: `Trimestres coinciden: ${trimestrePagina}` };
        }
        return { valido: false, mensaje: `❌ Trimestres no coinciden` };
    }

    // ==========================================
    // 🔹 CERRAR MODAL
    // ==========================================
    async function cerrarModalConfirmacion() {
        await esperar(150);
        const btnAceptar = Array.from(document.querySelectorAll('button')).find(btn => {
            const txt = btn.textContent.trim().toLowerCase();
            return btn.offsetParent !== null && (txt === 'aceptar' || txt === 'ok' || txt === 'cerrar');
        });
        if (btnAceptar) btnAceptar.click();
        await esperar(100);
    }

    // ==========================================
    // 🔹 LIMPIEZA FINAL
    // ==========================================
    async function limpiezaFinalModales() {
        await esperar(500);
        document.querySelectorAll('.modal-backdrop, .backdrop').forEach(b => b.remove());
    }

    // ==========================================
    // 🔹 ARRASTRAR PANEL (CORREGIDO)
    // ==========================================
    function hacerArrastrable() {
        const panel = document.getElementById('importador-educarecuador');
        const header = document.getElementById('panelHeader');
        if (!panel || !header) return;

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', function(e) {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            panel.style.cursor = 'grabbing';
            panel.style.right = 'auto'; // ✅ Importante: quitar right para usar left
            panel.style.top = initialTop + 'px';
            panel.style.left = initialLeft + 'px';

            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            panel.style.left = (initialLeft + deltaX) + 'px';
            panel.style.top = (initialTop + deltaY) + 'px';
            panel.style.right = 'auto'; // ✅ Asegurar que right no interfiera

            e.preventDefault();
        });

        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                panel.style.cursor = 'move';
            }
        });

        // ✅ Cambiar cursor para indicar que es arrastrable
        header.style.cursor = 'move';
    }

    // ==========================================
    // 🔹 CREAR PANEL
    // ==========================================
    function crearBotonFlotante() {
        if (document.getElementById('importador-educarecuador')) return;
        const container = document.createElement('div');
        container.id = 'importador-educarecuador';
        container.style.cssText = 'position: fixed; top: 100px; right: 20px; z-index: 99999; cursor: move;';
        container.innerHTML = `
            <div style="background: #C8C8C8; border: 1px solid #dee2e6; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); color: #212529; font-family: sans-serif; min-width: 420px;">
                <div id="panelHeader" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #adb5bd; color: white; border-radius: 8px 8px 0 0; cursor: move;">
                    <h3 style="margin: 0; font-size: 16px;">📊 Importador de Calificaciones</h3>
                    <button id="btnCerrarPanel" style="background: rgba(255,255,255,0.2); border:none; color:white; width:30px; height:30px; border-radius:4px; cursor:pointer;">×</button>
                </div>
                <div style="padding: 20px;">
                    <div style="background: #fafafa; border: 1px solid #9ec5fe; border-left: 4px solid #adb5bd; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 13px;">
                        <strong>🔐 Modo Seguro:</strong><br>
                        1. Copie calificaciones desde www.webprosistem.com<br>
                        2. Click en "▶ INICIAR IMPORTACIÓN"<br>
                    </div>
                    <button id="btnIniciarImport" style="width: 100%; padding: 12px; background: #ffc107; color: #212529; border: none; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 10px;">▶ INICIAR IMPORTACIÓN</button>
                    <button id="btnContinuar" style="width: 100%; padding: 12px; background: #0d6efd; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 10px; display: none;">⏭ CONTINUAR</button>
                    <button id="btnFinalizar" style="width: 100%; padding: 12px; background: #dc3545; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 10px; display: none;">PROCESO FINALIZADO</button>
                    <div id="progresoContainer" style="display: none; margin-top: 16px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;">
                            <span id="progresoTexto">Progreso...</span>
                            <span id="progresoPorcentaje" style="color:#0d6efd; font-weight:600;">0%</span>
                        </div>
                        <div style="width:100%;height:20px;background:#e9ecef;border-radius:10px;overflow:hidden;">
                            <div id="barraProgreso" style="width:0%;height:100%;background:linear-gradient(90deg, #198754 0%, #20c997 100%);transition:width 0.3s ease;"></div>
                        </div>
                    </div>
                    <div id="estadoContainer" style="margin-top: 16px; padding: 12px; border-radius: 6px; font-size: 14px; font-weight: 500; text-align: center; display: none;">
                        <span id="estadoTexto">Esperando...</span>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(container);
        document.getElementById('btnCerrarPanel').onclick = function() {
            procesoPausado = true;
            autoPaginacionActiva = false;
            cleanupRealizado = true;
            container.remove();
        };
        document.getElementById('btnIniciarImport').onclick = iniciarImportacionAuto;
        document.getElementById('btnContinuar').onclick = continuarProceso;
        document.getElementById('btnFinalizar').onclick = function() { forzarLimpieza(true); };

        // ✅ Llamar a hacerArrastrable después de crear el panel
        setTimeout(hacerArrastrable, 100);
    }

    // ==========================================
    // 🔹 TOAST
    // ==========================================
    function showToastTrimestre(mensaje, tipo = 'error') {
        const toast = document.createElement('div');
        const bgColor = tipo === 'error' ? '#f8d7da' : '#d1e7dd';
        const borderColor = tipo === 'error' ? '#f5c2c7' : '#badbcc';
        const textColor = tipo === 'error' ? '#842029' : '#0f5132';
        const icon = tipo === 'error' ? '❌' : '✅';
        toast.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 100001; padding: 16px 24px; border-radius: 8px; background: ${bgColor}; border: 1px solid ${borderColor}; color: ${textColor}; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 450px;`;
        toast.innerHTML = `<span>${icon}</span><span>${mensaje}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 6000);
    }

    function actualizarEstado(mensaje, tipo) {
        const estadoContainer = document.getElementById('estadoContainer');
        const estadoTexto = document.getElementById('estadoTexto');
        if (!estadoContainer || !estadoTexto) return;
        estadoContainer.style.display = 'block';
        estadoTexto.textContent = mensaje;
        const styles = {
            'escribiendo': {bg:'#fff3cd', bc:'#ffecb5', c:'#664d03'},
            'guardando': {bg:'#cfe2ff', bc:'#9ec5fe', c:'#084298'},
            'success': {bg:'#d1e7dd', bc:'#badbcc', c:'#0f5132'},
            'error': {bg:'#f8d7da', bc:'#f5c2c7', c:'#842029'}
        };
        const s = styles[tipo] || {bg:'#e9ecef', bc:'#dee2e6', c:'#495057'};
        estadoContainer.style.background = s.bg;
        estadoContainer.style.borderColor = s.bc;
        estadoContainer.style.color = s.c;
    }

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
    // 🔹 VALIDAR ASIGNATURA
    // ==========================================
    function validarAsignaturaEstricta(asignaturaJSON, asignaturaPagina) {
        if (!asignaturaJSON) {
            return { valido: true, mensaje: '⚠️ Sin asignatura en JSON' };
        }

        if (!asignaturaPagina) {
            return { valido: false, mensaje: `❌ ASIGNATURA NO DETECTADA EN PÁGINA` };
        }

        if (!coincideAsignatura(asignaturaJSON, asignaturaPagina)) {
            const jsonNorm = normalizarTexto(asignaturaJSON);
            const paginaNorm = normalizarTexto(asignaturaPagina);
            return {
                valido: false,
                mensaje: `❌ NO COINCIDEN LAS ASIGNATURAS: "${jsonNorm}" | Página: "${paginaNorm}"`
            };
        }

        return { valido: true, mensaje: `✅ Asignatura válida (coincidencia flexible)` };
    }

    // ==========================================
    // 🔹 INICIAR IMPORTACIÓN
    // ==========================================
    async function iniciarImportacionAuto() {
        let texto = '';
        try {
            if (navigator.clipboard?.readText)
                texto = await navigator.clipboard.readText();
        } catch (e) {
            console.log('⚠️ No se pudo leer portapapeles');
        }

        if (!texto || texto.trim() === '') {
            alert('❌ Copie calificaciones primero');
            return;
        }

        try {
            calificaciones = JSON.parse(texto);
        } catch (e) {
            alert('❌ Error: ' + e.message);
            return;
        }

        if (!calificaciones?.length) {
            alert('❌ No hay datos');
            return;
        }

        if (!calificaciones[0].cedula) {
            alert('❌ Falta campo "cedula"');
            return;
        }

        // Validar trimestre
        trimestreJSON = calificaciones[0].trimestre || '';
        trimestrePagina = leerTrimestrePagina();
        const validacionTrimestre = validarTrimestres(trimestreJSON, trimestrePagina);
        if (!validacionTrimestre.valido) {
            showToastTrimestre(validacionTrimestre.mensaje, 'error');
            actualizarEstado(validacionTrimestre.mensaje, 'error');
            return;
        }
        showToastTrimestre(validacionTrimestre.mensaje, 'success');
        await esperar(800);

        // Validar asignatura (COINCIDENCIA FLEXIBLE)
        asignaturaJSON = calificaciones[0].asignatura || '';
        asignaturaPagina = leerAsignaturaPagina();

        const validacionAsignatura = validarAsignaturaEstricta(asignaturaJSON, asignaturaPagina);
        if (!validacionAsignatura.valido) {
            showToastTrimestre(validacionAsignatura.mensaje, 'error');
            actualizarEstado(validacionAsignatura.mensaje, 'error');
            return;
        }

        validacionAsignaturaActiva = true;
        showToastTrimestre(validacionAsignatura.mensaje, 'success');
        await esperar(800);

        // Normalizar cédulas
        calificaciones = calificaciones.map(est => ({
            ...est,
            cedula: (est.cedula || '').toString().toUpperCase().replace(/[\s\-\.]/g, '').trim()
        }));

        // Filtrar por asignatura
        if (validacionAsignaturaActiva && asignaturaPagina) {
            const antes = calificaciones.length;
            calificaciones = calificaciones.filter(est =>
                est.asignatura && coincideAsignatura(est.asignatura, asignaturaPagina)
            );
            console.log(`📚 Filtrado: ${antes} → ${calificaciones.length}`);

            if (calificaciones.length === 0) {
                alert('❌ Sin datos para esta asignatura');
                return;
            }
        }

        // Iniciar proceso
        paginaActual = 1;
        procesoPausado = false;
        autoPaginacionActiva = true;
        cleanupRealizado = false;
        filasPendientesGuardar = [];
        contadorMigrados = 0;
        contadorNoMigrados = 0;
        calificacionesProcesadas.clear();

        document.getElementById('btnIniciarImport').style.display = 'none';
        document.getElementById('progresoContainer').style.display = 'block';
        actualizarBarraProgreso(0, calificaciones.length);
        actualizarEstado('🔐 Iniciando...', 'escribiendo');
        await procesarPaginaActual();
    }

    // ==========================================
    // 🔹 PROCESAR PÁGINA
    // ==========================================
    async function procesarPaginaActual() {
        const filas = document.querySelectorAll('table tbody tr');
        actualizarEstado('✏️ Página ' + paginaActual, 'escribiendo');

        for (const fila of filas) {
            if (procesoPausado) break;
            if (fila.style.display === 'none' || fila.hidden) continue;

            let cedulaEnFila = null;
            for (const td of fila.querySelectorAll('td')) {
                cedulaEnFila = detectarCedulaEnTexto(td.textContent.trim());
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
                        } else {
                            contadorNoMigrados++;
                        }
                    } catch (e) {
                        console.error('Error:', e);
                        contadorNoMigrados++;
                    }
                    break;
                }
            }
            await esperar(150);
        }

        if (filasPendientesGuardar.length > 0) {
            await guardarRegistrosAuto();
        }

        if (calificacionesProcesadas.size >= calificaciones.length) {
            actualizarEstado(`¡Completado! ${contadorMigrados}`, 'success');
            finalizarImportacionAuto();
        } else {
            await navegarPaginaSiguiente();
        }
    }

    // ==========================================
    // 🔹 ESCRIBIR NOTA
    // ==========================================
    async function escribirNotaConFila(estudiante, fila) {
        fila.style.background = '#fff3cd';
        const inputs = fila.querySelectorAll('input[type="text"], input[type="number"]');
        let inputNota = inputs.length > 0 ? inputs[inputs.length - 1] : null;
        if (!inputNota) {
            fila.style.background = '';
            return { exito: false, fila: null };
        }

        inputNota.focus();
        inputNota.value = '';
        await esperar(50);

        const notaStr = estudiante.nota.toString();
        for (const char of notaStr) {
            inputNota.value += char;
            await esperar(15);
        }

        inputNota.dispatchEvent(new Event('input', { bubbles: true }));
        inputNota.dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(100);

        fila.style.background = '#d1e7dd';
        return { exito: true, fila: fila };
    }

    // ==========================================
    // 🔹 GUARDAR
    // ==========================================
    async function guardarRegistrosAuto() {
        for (const fila of filasPendientesGuardar) {
            const btnGuardar = fila.querySelector('button') ||
                Array.from(document.querySelectorAll('button')).find(b =>
                    b.textContent.toLowerCase().includes('guardar')
                );
            if (btnGuardar) {
                btnGuardar.click();
                await esperar(1200);
                await cerrarModalConfirmacion();
            }
            await esperar(200);
        }
        filasPendientesGuardar = [];
    }

    // ==========================================
    // 🔹 PAGINACIÓN
    // ==========================================
    async function navegarPaginaSiguiente() {
        if (!autoPaginacionActiva || paginaActual >= 10) {
            finalizarImportacionAuto();
            return;
        }

        await esperar(800);
        const btnSiguiente = Array.from(document.querySelectorAll('button')).find(b => {
            const txt = b.textContent.trim().toLowerCase();
            return b.offsetParent !== null && (txt.includes('siguiente') || txt === '>');
        });

        if (!btnSiguiente) {
            actualizarEstado('No hay más páginas', 'success');
            finalizarImportacionAuto();
            return;
        }

        btnSiguiente.click();
        await esperar(2500);
        paginaActual++;
        await procesarPaginaActual();
    }

    async function continuarProceso() {
        procesoPausado = false;
        autoPaginacionActiva = true;
        document.getElementById('btnContinuar').style.display = 'none';
        await procesarPaginaActual();
    }

    async function finalizarImportacionAuto() {
        autoPaginacionActiva = false;
        procesoPausado = true;
        document.getElementById('btnFinalizar').style.display = 'block';
        await limpiezaFinalModales();
    }

    function forzarLimpieza(conRefresh = false) {
        if (cleanupRealizado) return;
        cleanupRealizado = true;
        autoPaginacionActiva = false;
        procesoPausado = true;
        calificaciones = [];
        calificacionesProcesadas.clear();
        validacionAsignaturaActiva = false;

        document.getElementById('progresoContainer').style.display = 'none';
        document.getElementById('estadoContainer').style.display = 'none';
        document.getElementById('btnContinuar').style.display = 'none';
        document.getElementById('btnFinalizar').style.display = 'none';

        const btnIniciar = document.getElementById('btnIniciarImport');
        if (btnIniciar) {
            btnIniciar.style.display = 'block';
            btnIniciar.textContent = '▶ NUEVA IMPORTACIÓN';
        }

        if (conRefresh) {
            setTimeout(() => { location.reload(); }, 1000);
        }
    }

    function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // ==========================================
    // 🔹 INICIALIZAR
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
