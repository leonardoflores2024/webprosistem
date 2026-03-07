// ==UserScript==
// @name         Importar Calificaciones - Educarecuador (Con Resaltado Naranja)
// @namespace    http://tampermonkey.net/
// @version      18.0
// @description  Importar automático - Modo Seguro Clipboard + Limpia Portapapeles al Finalizar + Solo Toast NO MIGRADOS
// @author       Tú
// @match        https://academico.educarecuador.gob.ec/    *
// @match        *://*.educarecuador.gob.ec/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 Script v18.0 - Limpia Clipboard al Finalizar + Seguridad');

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
    // CREAR PANEL
    // ==========================================
    function crearBotonFlotante() {
        if (document.getElementById('importador-educarecuador')) return;

        const container = document.createElement('div');
        container.id = 'importador-educarecuador';
        container.style.cssText = 'position: fixed; top: 100px; right: 20px; z-index: 99999;';

        container.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 20px; border-radius: 15px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                color: white; font-family: Arial, sans-serif;
                min-width: 400px; max-width: 450px;
            ">
                <div id="panelHeader" style="
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 15px; cursor: move; padding: 10px;
                    background: rgba(255,255,255,0.2); border-radius: 8px;
                ">
                    <h3 style="margin: 0; font-size: 16px; user-select: none; color: white;">
                        📊 Importador de Calificaciones
                    </h3>
                    <div style="display:flex;gap:5px;">
                        <button id="btnReset" title="Limpiar" style="
                            background: rgba(239,68,68,0.9); border:none; color:white;
                            width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:14px;">🧹</button>
                        <button id="btnCerrarPanel" style="
                            background: rgba(255,255,255,0.2); border:none; color:white;
                            width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:16px;">×</button>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 12px; line-height: 1.5;">
                    <strong>🔐 Modo Seguro:</strong><br>
                    1. Copie los datos de www.webprosistem.com<br>
                    2. Haga clic en "▶️ INICIAR IMPORTACIÓN"<br>
                    3. El script leerá directamente de su portapapeles<br>
                    <small style="opacity:0.8;">💡 Asegúrese de tener los datos copiados antes de iniciar</small>
                </div>

                <button id="btnIniciarImport" style="
                    width: 100%; padding: 14px; background: #10b981;
                    color: white; border: none; border-radius: 8px;
                    font-weight: bold; font-size: 15px; cursor: pointer;
                    margin-bottom: 10px;">
                    ▶️ INICIAR
                </button>

                <button id="btnContinuar" style="
                    width: 100%; padding: 14px; background: #3b82f6;
                    color: white; border: none; border-radius: 8px;
                    font-weight: bold; font-size: 15px; cursor: pointer;
                    margin-bottom: 10px; display: none;">
                    ⏭️ CONTINUAR
                </button>

                <button id="btnFinalizar" style="
                    width: 100%; padding: 14px; background: #ef4444;
                    color: white; border: none; border-radius: 8px;
                    font-weight: bold; font-size: 15px; cursor: pointer;
                    margin-bottom: 10px; display: none;">
                    ✅ FINALIZAR
                </button>

                <!-- BARRA DE PROGRESO -->
                <div id="progresoContainer" style="display: none; margin-top: 15px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:12px;">
                        <span id="progresoTexto">Progreso...</span>
                        <span id="progresoPorcentaje">0%</span>
                    </div>
                    <div style="width:100%;height:12px;background:rgba(255,255,255,0.3);border-radius:6px;overflow:hidden;">
                        <div id="barraProgreso" style="width:0%;height:100%;background:#10b981;transition:width 0.3s;"></div>
                    </div>
                </div>

                <!-- INDICADOR DE ESTADO CON COLORES -->
                <div id="estadoContainer" style="
                    margin-top: 10px; padding: 12px; border-radius: 8px;
                    font-size: 13px; font-weight: bold; text-align: center;
                    display: none; transition: all 0.3s ease;
                    border: 2px solid transparent;
                ">
                    <span id="estadoTexto">Esperando...</span>
                </div>

                <!-- LOG OCULTO -->
                <div id="logContainer" style="display: none;"></div>
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

        setTimeout(hacerArrastrable, 300);
        showToast('✅ Panel listo - Copie datos antes de iniciar', 'success');
    }

    // ==========================================
    // TOAST NOTIFICATION - Top-Right Stacking
    // ==========================================
    function showToast(mensaje, tipo = 'info') {
        const toast = document.createElement('div');

        // Calcular posición para stacking en esquina superior derecha
        const existingToasts = document.querySelectorAll('.toast-nm');
        const topOffset = 20 + (existingToasts.length * 55);

        toast.className = 'toast-nm';
        toast.style.cssText = `
            position: fixed; top: ${topOffset}px; right: 20px;
            z-index: 100000; padding: 12px 24px; border-radius: 8px;
            color: white; font-weight: bold; font-size: 13px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.3s ease; opacity: 0; transform: translateX(50px);
            max-width: 350px; word-wrap: break-word;
        `;

        if (tipo === 'success') toast.style.background = '#10b981';
        else if (tipo === 'error') toast.style.background = '#ef4444';
        else if (tipo === 'warning') toast.style.background = '#f59e0b';
        else toast.style.background = '#3b82f6';

        toast.textContent = mensaje;
        document.body.appendChild(toast);

        // Animación de entrada
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

    // Función auxiliar para reajustar posición de toasts cuando uno desaparece
    function reajustarToasts() {
        const toasts = document.querySelectorAll('.toast-nm');
        toasts.forEach((toast, index) => {
            toast.style.top = (20 + index * 55) + 'px';
        });
    }

    // ==========================================
    // ACTUALIZAR ESTADO CON COLORES
    // ==========================================
    function actualizarEstado(mensaje, tipo) {
        const estadoContainer = document.getElementById('estadoContainer');
        const estadoTexto = document.getElementById('estadoTexto');

        if (!estadoContainer || !estadoTexto) return;

        estadoContainer.style.display = 'block';
        estadoTexto.textContent = mensaje;

        switch(tipo) {
            case 'escribiendo':
                estadoContainer.style.background = 'rgba(245, 158, 11, 0.9)';
                estadoContainer.style.borderColor = '#f59e0b';
                estadoContainer.style.color = '#ffffff';
                break;
            case 'guardando':
                estadoContainer.style.background = 'rgba(59, 130, 246, 0.9)';
                estadoContainer.style.borderColor = '#3b82f6';
                estadoContainer.style.color = '#ffffff';
                break;
            case 'navegando':
                estadoContainer.style.background = 'rgba(139, 92, 246, 0.9)';
                estadoContainer.style.borderColor = '#8b5cf6';
                estadoContainer.style.color = '#ffffff';
                break;
            case 'success':
                estadoContainer.style.background = 'rgba(16, 185, 129, 0.9)';
                estadoContainer.style.borderColor = '#10b981';
                estadoContainer.style.color = '#ffffff';
                break;
            case 'error':
                estadoContainer.style.background = 'rgba(239, 68, 68, 0.9)';
                estadoContainer.style.borderColor = '#ef4444';
                estadoContainer.style.color = '#ffffff';
                break;
            case 'warning':
                estadoContainer.style.background = 'rgba(251, 191, 36, 0.9)';
                estadoContainer.style.borderColor = '#fbbf24';
                estadoContainer.style.color = '#000000';
                break;
            default:
                estadoContainer.style.background = 'rgba(255,255,255,0.2)';
                estadoContainer.style.borderColor = 'transparent';
                estadoContainer.style.color = '#ffffff';
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
    // INICIAR IMPORTACIÓN - MODO SEGURO CLIPBOARD
    // ==========================================
    async function iniciarImportacionAuto() {
        let texto = '';

        // 🔐 INTENTO 1: Leer directamente del portapapeles (más seguro)
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
            showToast('❌ Error JSON: ' + e.message, 'error'); return;
        }

        if (!calificaciones || calificaciones.length === 0) {
            showToast('❌ No hay datos', 'error'); return;
        }
        if (!calificaciones[0].cedula) {
            showToast('❌ Falta campo "cedula"', 'error'); return;
        }

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

        showToast(`🚀 Iniciando: ${calificaciones.length} registros (modo seguro)`, 'info');

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
            // ESCRIBIR NOTAS
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
                        // ✅ MIGRADO: SIN TOAST (solo se muestra NO MIGRADO)
                    } else {
                        contadorNoMigrados++;
                        // ❌ TOAST ROJO - NO MIGRADO (único que se muestra)
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

            // GUARDAR
            if (filasPendientesGuardar.length > 0) {
                actualizarEstado('💾 Guardando registros...', 'guardando');
                await guardar5RegistrosAuto();
            }

            // VERIFICAR SI TERMINÓ
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
    // ESCRIBIR NOTA (CON RESALTADO NARANJA) ✅
    // ==========================================
    async function escribirNota(estudiante) {
        const cedula = estudiante.cedula || estudiante.id;

        const filas = document.querySelectorAll('table tbody tr');
        let filaEncontrada = null;

        for (const fila of filas) {
            if (fila.style.display === 'none' || fila.hidden) continue;
            if (fila.textContent.includes(cedula)) {
                filaEncontrada = fila;
                break;
            }
        }

        if (!filaEncontrada) {
            // ❌ No se encontró la cédula
            return { exito: false, fila: null };
        }

        // 🟠 RESALTAR FILA EN NARANJA MIENTRAS PROCESA
        filaEncontrada.style.background = 'rgba(255, 165, 0, 0.6)';
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

        // ✅ CAMBIAR A VERDE CUANDO TERMINA DE ESCRIBIR
        filaEncontrada.style.background = 'rgba(16, 185, 129, 0.4)';

        return { exito: true, fila: filaEncontrada, nota: estudiante.nota };
    }

    // ==========================================
    // GUARDAR 5 REGISTROS (FILAS VERDES PERMANENTES) ✅
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
                    await esperar(1500);

                    // ✅ LAS FILAS SE QUEDAN VERDES PERMANENTEMENTE
                }
            } catch (e) {
                console.error('Error guardando:', e);
            }

            await esperar(400);
        }

        filasPendientesGuardar = [];
        await esperar(500);
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
    // FINALIZAR - CON LIMPIEZA DE PORTAPAPELES ✅
    // ==========================================
    function finalizarImportacionAuto() {
        autoPaginacionActiva = false;
        procesoPausado = true;

        document.getElementById('btnFinalizar').style.display = 'block';

        setTimeout(() => {
            showToast(`✅ COMPLETADO: ${contadorMigrados} migrados, ${contadorNoMigrados} no migrados`, 'success');

            // 🔐 LIMPIAR PORTAPAPELES POR SEGURIDAD
            limpiarPortapapeles();
        }, 500);
    }

    // ==========================================
    // LIMPIAR PORTAPAPELES - NUEVA FUNCIÓN 🔐
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
