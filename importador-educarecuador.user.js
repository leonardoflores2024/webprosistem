// ==UserScript==
// @name         Importar Calificaciones - Educarecuador (Bootstrap Professional)
// @namespace    http://tampermonkey.net/
// @version      19.2
// @description  Importar automático - Header Gris + Botón Warning Bootstrap + Auto-Close Modal
// @author       Tú
// @match        https://academico.educarecuador.gob.ec/*
// @match        *://*.educarecuador.gob.ec/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 Script v19.2 - Header Gris + Botón Warning Bootstrap');

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

    // ==========================================
    // 🔹 FUNCIÓN AUXILIAR: COMPARAR CÉDULAS
    // ==========================================
    function compararCedulas(cedulaBuscada, textoCelda) {
        if (!cedulaBuscada || !textoCelda) return false;

        const a = cedulaBuscada.toString().replace(/\s+/g, '').trim();
        const b = textoCelda.toString().replace(/\s+/g, '').trim();

        return a === b && a.length >= 10 && /^\d+[\d\.\-]*$/.test(a);
    }

    // ==========================================
    // 🔹 CERRAR MODAL DE CONFIRMACIÓN AUTOMÁTICAMENTE
    // ==========================================
    async function cerrarModalConfirmacion() {
        try {
            await esperar(500);

            const btnAceptar = Array.from(document.querySelectorAll('button')).find(btn =>
                (btn.textContent.trim() === 'Aceptar' ||
                 btn.textContent.trim() === 'OK' ||
                 btn.textContent.trim() === 'Cerrar') &&
                btn.offsetParent !== null
            );

            if (btnAceptar) {
                console.log('✅ Modal detectado - Cerrando automáticamente...');
                btnAceptar.click();
                await esperar(300);
                return true;
            }

            return false;
        } catch (e) {
            console.warn('⚠️ Error cerrando modal:', e);
            return false;
        }
    }

    // ==========================================
    // ARRASTRAR PANEL
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
            e.preventDefault();
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            panel.style.left = (initialLeft + deltaX) + 'px';
            panel.style.top = (initialTop + deltaY) + 'px';
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
                background: #C8C8C8;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                color: #212529; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                min-width: 420px; max-width: 470px;
            ">
                <!-- HEADER - Bootstrap Secondary (Gris) -->
                <div id="panelHeader" style="
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 16px;
                    background: #adb5bd;
                    color: white;
                    border-radius: 8px 8px 0 0;
                    cursor: move;
                ">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600; user-select: none; color: white;">
                        📊 Importador de Calificaciones
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

                <!-- BODY -->
                <div style="padding: 20px;">
                    <!-- Info Box - Bootstrap Info -->
                    <div style="
                        background: #fafafa;
                        border: 1px solid #9ec5fe;
                        border-left: 4px solid #adb5bd;
                        padding: 12px; border-radius: 6px;
                        margin-bottom: 16px; font-size: 13px; line-height: 1.6;
                        color: #055160;
                    ">
                        <strong style="color: #084298;">🔐 Modo Seguro:</strong><br>
                        1. Copie los datos de www.webprosistem.com<br>
                        2. Haga clic en "▶️ INICIAR IMPORTACIÓN"<br>
                        3. El script leerá directamente de su portapapeles<br>
                        <small style="opacity:0.85;">💡 Asegúrese de tener los datos copiados antes de iniciar</small>
                    </div>

                    <!-- Botón Iniciar - Bootstrap Warning (Amarillo) -->
                    <button id="btnIniciarImport" style="
                        width: 100%; padding: 12px;
                        background: #ffc107;
                        color: #212529; border: none; border-radius: 6px;
                        font-weight: 600; font-size: 15px; cursor: pointer;
                        margin-bottom: 10px;
                        transition: all 0.2s;
                        box-shadow: 0 2px 4px rgba(255,193,7,0.2);"
                        onmouseover="this.style.background='#ffca2c'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(255,193,7,0.3)'"
                        onmouseout="this.style.background='#ffc107'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(255,193,7,0.2)'">
                        ▶️ INICIAR IMPORTACIÓN
                    </button>

                    <!-- Botón Continuar - Bootstrap Primary -->
                    <button id="btnContinuar" style="
                        width: 100%; padding: 12px;
                        background: #0d6efd;
                        color: white; border: none; border-radius: 6px;
                        font-weight: 600; font-size: 15px; cursor: pointer;
                        margin-bottom: 10px; display: none;
                        transition: all 0.2s;
                        box-shadow: 0 2px 4px rgba(13,110,253,0.2);"
                        onmouseover="this.style.background='#0b5ed7'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(13,110,253,0.3)'"
                        onmouseout="this.style.background='#0d6efd'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(13,110,253,0.2)'">
                        ⏭️ CONTINUAR
                    </button>

                    <!-- Botón Finalizar - Bootstrap Danger -->
                    <button id="btnFinalizar" style="
                        width: 100%; padding: 12px;
                        background: #dc3545;
                        color: white; border: none; border-radius: 6px;
                        font-weight: 600; font-size: 15px; cursor: pointer;
                        margin-bottom: 10px; display: none;
                        transition: all 0.2s;
                        box-shadow: 0 2px 4px rgba(220,53,69,0.2);"
                        onmouseover="this.style.background='#bb2d3b'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(220,53,69,0.3)'"
                        onmouseout="this.style.background='#dc3545'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(220,53,69,0.2)'">
                        ✅ PROCESO FINALIZADO
                    </button>

                    <!-- BARRA DE PROGRESO - Bootstrap Progress -->
                    <div id="progresoContainer" style="display: none; margin-top: 16px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; font-weight:500; color:#495057;">
                            <span id="progresoTexto">Progreso...</span>
                            <span id="progresoPorcentaje" style="color:#0d6efd; font-weight:600;">0%</span>
                        </div>
                        <div style="width:100%;height:20px;background:#e9ecef;border-radius:10px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.1);">
                            <div id="barraProgreso" style="width:0%;height:100%;background:linear-gradient(90deg, #198754 0%, #20c997 100%);transition:width 0.3s ease;"></div>
                        </div>
                    </div>

                    <!-- INDICADOR DE ESTADO - Bootstrap Alerts -->
                    <div id="estadoContainer" style="
                        margin-top: 16px; padding: 12px; border-radius: 6px;
                        font-size: 14px; font-weight: 500; text-align: center;
                        display: none; transition: all 0.3s ease;
                        border: 1px solid transparent;
                    ">
                        <span id="estadoTexto">Esperando...</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // Event listeners
        const btnCerrar = document.getElementById('btnCerrarPanel');
        if (btnCerrar) {
            btnCerrar.onclick = function() {
                console.log('🔴 Cerrando panel...');
                procesoPausado = true;
                autoPaginacionActiva = false;
                cleanupRealizado = true;
                container.remove();
                showToast('Panel cerrado', 'info');
            };
        }

        const btnReset = document.getElementById('btnReset');
        if (btnReset) btnReset.onclick = forzarLimpieza;

        const btnIniciar = document.getElementById('btnIniciarImport');
        if (btnIniciar) btnIniciar.onclick = iniciarImportacionAuto;

        const btnContinuar = document.getElementById('btnContinuar');
        if (btnContinuar) btnContinuar.onclick = continuarProceso;

        const btnFinalizar = document.getElementById('btnFinalizar');
        if (btnFinalizar) btnFinalizar.onclick = forzarLimpieza;

        setTimeout(() => {
            hacerArrastrable();
        }, 300);

        showToast('✅ Panel listo - Copie datos antes de iniciar', 'success');
    }

    // ==========================================
    // TOAST NOTIFICATION - Bootstrap Colors
    // ==========================================
    function showToast(mensaje, tipo = 'info') {
        const toast = document.createElement('div');

        const existingToasts = document.querySelectorAll('.toast-nm');
        const topOffset = 20 + (existingToasts.length * 65);

        toast.className = 'toast-nm';

        let bgColor, borderColor, textColor, icon;

        switch(tipo) {
            case 'success':
                bgColor = '#d1e7dd';
                borderColor = '#badbcc';
                textColor = '#0f5132';
                icon = '✅';
                break;
            case 'error':
                bgColor = '#f8d7da';
                borderColor = '#f5c2c7';
                textColor = '#842029';
                icon = '❌';
                break;
            case 'warning':
                bgColor = '#fff3cd';
                borderColor = '#ffecb5';
                textColor = '#664d03';
                icon = '⚠️';
                break;
            default:
                bgColor = '#cff4fc';
                borderColor = '#b6effb';
                textColor = '#055160';
                icon = 'ℹ️';
        }

        toast.style.cssText = `
            position: fixed; top: ${topOffset}px; right: 20px;
            z-index: 100000; padding: 14px 20px; border-radius: 8px;
            background: ${bgColor};
            border: 1px solid ${borderColor};
            color: ${textColor};
            font-weight: 500; font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.3s ease; opacity: 0; transform: translateX(50px);
            max-width: 380px; word-wrap: break-word;
            display: flex; align-items: center; gap: 10px;
        `;

        toast.innerHTML = `<span style="font-size:18px;">${icon}</span><span>${mensaje}</span>`;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => {
                toast.remove();
                reajustarToasts();
            }, 300);
        }, 4000);
    }

    function reajustarToasts() {
        const toasts = document.querySelectorAll('.toast-nm');
        toasts.forEach((toast, index) => {
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

        switch(tipo) {
            case 'escribiendo':
                estadoContainer.style.background = '#fff3cd';
                estadoContainer.style.borderColor = '#ffecb5';
                estadoContainer.style.color = '#664d03';
                break;
            case 'guardando':
                estadoContainer.style.background = '#cfe2ff';
                estadoContainer.style.borderColor = '#9ec5fe';
                estadoContainer.style.color = '#084298';
                break;
            case 'navegando':
                estadoContainer.style.background = '#e2e3e5';
                estadoContainer.style.borderColor = '#d3d6d8';
                estadoContainer.style.color = '#41464b';
                break;
            case 'success':
                estadoContainer.style.background = '#d1e7dd';
                estadoContainer.style.borderColor = '#badbcc';
                estadoContainer.style.color = '#0f5132';
                break;
            case 'error':
                estadoContainer.style.background = '#f8d7da';
                estadoContainer.style.borderColor = '#f5c2c7';
                estadoContainer.style.color = '#842029';
                break;
            case 'warning':
                estadoContainer.style.background = '#fff3cd';
                estadoContainer.style.borderColor = '#ffecb5';
                estadoContainer.style.color = '#664d03';
                break;
            default:
                estadoContainer.style.background = '#e9ecef';
                estadoContainer.style.borderColor = '#dee2e6';
                estadoContainer.style.color = '#495057';
        }
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
            if (navigator.clipboard && navigator.clipboard.readText) {
                texto = await navigator.clipboard.readText();
                console.log('🔐 Datos leídos directamente del portapapeles');
            }
        } catch (e) {
            console.log('⚠️ No se pudo leer del portapapeles:', e.message);
        }

        if (!texto || texto.trim() === '') {
            showToast('❌ Copie las calificaciones de www.webprosistem.com antes de iniciar', 'error');
            return;
        }

        try {
            calificaciones = JSON.parse(texto);
        } catch (e) {
            showToast('❌ Error JSON: ' + e.message, 'error');
            return;
        }

        if (!calificaciones || calificaciones.length === 0) {
            showToast('❌ No hay datos', 'error');
            return;
        }
        if (!calificaciones[0].cedula) {
            showToast('❌ Falta campo "cedula"', 'error');
            return;
        }

        // Normalizar cédulas al cargar
        calificaciones = calificaciones.map(est => ({
            ...est,
            cedula: (est.cedula || '').toString().replace(/\s+/g, ''),
            id: (est.id || '').toString().replace(/\s+/g, '')
        }));

        indiceActual = 0;
        paginaActual = 1;
        procesoPausado = false;
        autoPaginacionActiva = true;
        cleanupRealizado = false;
        filasPendientesGuardar = [];
        contadorMigrados = 0;
        contadorNoMigrados = 0;

        document.getElementById('btnIniciarImport').style.display = 'none';
        document.getElementById('btnContinuar').style.display = 'none';
        document.getElementById('btnFinalizar').style.display = 'none';
        document.getElementById('progresoContainer').style.display = 'block';

        actualizarBarraProgreso(0, calificaciones.length);
        actualizarEstado('🔐 Datos cargados - Iniciando...', 'escribiendo');

        showToast(`🚀 Iniciando: ${calificaciones.length} registros`, 'info');

        await procesarLoteAuto();
    }

    // ==========================================
    // PROCESAR LOTE AUTOMÁTICO
    // ==========================================
    async function procesarLoteAuto() {
        const loteSize = 5;
        const finLote = Math.min(indiceActual + loteSize, calificaciones.length);

        filasPendientesGuardar = [];

        try {
            actualizarEstado('✏️ Escribiendo notas...', 'escribiendo');

            for (let i = indiceActual; i < finLote; i++) {
                if (procesoPausado) return;

                const est = calificaciones[i];
                const cedula = est.cedula || est.id;

                try {
                    const resultado = await escribirNota(est);
                    if (resultado.exito) {
                        filasPendientesGuardar.push(resultado.fila);
                        contadorMigrados++;
                    } else {
                        contadorNoMigrados++;
                        showToast(`❌ NO MIGRADO: ${est.estudiante || cedula}`, 'error');
                    }
                } catch (e) {
                    console.error('Error escribiendo:', e);
                    contadorNoMigrados++;
                    showToast(`❌ NO MIGRADO: ${est.estudiante || cedula}`, 'error');
                }

                indiceActual++;
                actualizarBarraProgreso(indiceActual, calificaciones.length);
                await esperar(300);
            }

            if (filasPendientesGuardar.length > 0) {
                actualizarEstado('💾 Guardando registros...', 'guardando');
                await guardar5RegistrosAuto();
            }

            if (indiceActual >= calificaciones.length) {
                actualizarEstado('✅ ¡Completado!', 'success');
                finalizarImportacionAuto();
            } else {
                await navegarPaginaSiguiente();
            }

        } catch (error) {
            actualizarEstado('❌ Error: ' + error.message, 'error');
            showToast('❌ Error: ' + error.message, 'error');
            autoPaginacionActiva = false;
        }
    }

    // ==========================================
    // ESCRIBIR NOTA (CON RESALTADO BOOTSTRAP)
    // ==========================================
    async function escribirNota(estudiante) {
        const cedulaBuscada = estudiante.cedula || estudiante.id;
        const filas = document.querySelectorAll('table tbody tr');
        let filaEncontrada = null;

        for (const fila of filas) {
            if (fila.style.display === 'none' || fila.hidden) continue;

            const celdas = fila.querySelectorAll('td');
            for (const td of celdas) {
                const textoCelda = td.textContent.trim();

                if (compararCedulas(cedulaBuscada, textoCelda)) {
                    filaEncontrada = fila;
                    break;
                }
            }
            if (filaEncontrada) break;
        }

        if (!filaEncontrada) {
            return { exito: false, fila: null };
        }

        // 🟡 Bootstrap Warning color
        filaEncontrada.style.background = '#fff3cd';
        filaEncontrada.style.transition = 'background 0.3s ease';

        const inputs = filaEncontrada.querySelectorAll('input[type="text"], input[type="number"]');
        let inputNota = inputs.length > 0 ? inputs[inputs.length - 1] : null;

        if (!inputNota) {
            filaEncontrada.style.background = '';
            return { exito: false, fila: null };
        }

        inputNota.focus();
        inputNota.value = '';
        await esperar(100);

        const notaStr = estudiante.nota.toString();
        for (const char of notaStr) {
            inputNota.value += char;
            await esperar(25);
        }

        inputNota.dispatchEvent(new Event('input', { bubbles: true }));
        inputNota.dispatchEvent(new Event('change', { bubbles: true }));
        inputNota.dispatchEvent(new Event('blur', { bubbles: true }));

        await esperar(200);

        // ✅ Bootstrap Success color
        filaEncontrada.style.background = '#d1e7dd';

        return { exito: true, fila: filaEncontrada, nota: estudiante.nota };
    }

    // ==========================================
    // GUARDAR 5 REGISTROS + AUTO-CLOSE MODAL
    // ==========================================
    async function guardar5RegistrosAuto() {
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
                    await esperar(2000);

                    // 🔹 Cerrar modal de confirmación si aparece
                    await cerrarModalConfirmacion();
                }
            } catch (e) {
                console.error('Error guardando:', e);
            }

            await esperar(400);
        }

        filasPendientesGuardar = [];
        await esperar(500);

        // 🔹 Cerrar modal final después de guardar todos
        await cerrarModalConfirmacion();
    }

    // ==========================================
    // AUTO-PAGINACIÓN
    // ==========================================
    async function navegarPaginaSiguiente() {
        if (!autoPaginacionActiva) return;

        actualizarEstado('📄 Navegando página siguiente...', 'navegando');
        await esperar(1000);

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
            await esperar(3000);

            const filasNuevas = document.querySelectorAll('table tbody tr:not([style*="display:none"])');
            if (filasNuevas.length > 0) {
                paginaActual++;
                actualizarEstado(`✅ Página ${paginaActual} cargada`, 'success');
                showToast(`📄 Página ${paginaActual}`, 'info');
                await esperar(1000);
                await procesarLoteAuto();
            } else {
                throw new Error('La tabla no se actualizó');
            }
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
        procesoPausado = false;
        autoPaginacionActiva = true;
        document.getElementById('btnContinuar').style.display = 'none';

        actualizarEstado('▶️ Continuando...', 'escribiendo');
        await esperar(1000);
        await procesarLoteAuto();
    }

    // ==========================================
    // FINALIZAR
    // ==========================================
    function finalizarImportacionAuto() {
        autoPaginacionActiva = false;
        procesoPausado = true;

        document.getElementById('btnFinalizar').style.display = 'block';

        setTimeout(() => {
            showToast(`✅ COMPLETADO: ${contadorMigrados} migrados, ${contadorNoMigrados} no migrados`, 'success');
            limpiarPortapapeles();
        }, 500);
    }

    // ==========================================
    // LIMPIAR PORTAPAPELES
    // ==========================================
    async function limpiarPortapapeles() {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText('');
                console.log('🔐 Portapapeles limpiado por seguridad');
                showToast('🔒 Portapapeles limpiado - Datos eliminados', 'warning');
            }
        } catch (e) {
            console.log('⚠️ No se pudo limpiar el portapapeles:', e.message);
        }
    }

    // ==========================================
    // LIMPIEZA
    // ==========================================
    function forzarLimpieza() {
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

        document.getElementById('progresoContainer').style.display = 'none';
        document.getElementById('estadoContainer').style.display = 'none';
        document.getElementById('btnContinuar').style.display = 'none';
        document.getElementById('btnFinalizar').style.display = 'none';

        const btnIniciar = document.getElementById('btnIniciarImport');
        if (btnIniciar) {
            btnIniciar.style.display = 'block';
            btnIniciar.disabled = false;
            btnIniciar.textContent = '▶️ NUEVA IMPORTACIÓN';
            // ✅ Mantener estilo warning al reiniciar
            btnIniciar.style.background = '#ffc107';
            btnIniciar.style.color = '#212529';
        }

        showToast('🧹 Limpieza completada', 'success');
    }

    // ==========================================
    // UTILIDADES
    // ==========================================
    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==========================================
    // INICIALIZAR
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(crearBotonFlotante, 2000);
        });
    } else {
        setTimeout(crearBotonFlotante, 2000);
    }

})();
