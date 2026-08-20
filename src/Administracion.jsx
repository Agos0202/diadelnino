import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModalAlerta from './ModalAlerta';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Administracion.css';
import {
  actualizarNino,
  buscarNinos,
  crearNinosEnLote,
  eliminarNino,
  eliminarNinosEnLote,
  guardarNino,
  listarNinos,
  normalizarDni,
  normalizarFilaNinoDesdeCsv,
  parsearCsv,
  validarNinoFormulario,
} from './services/ninosService';

const RUTA_ADMIN = '/panel_diadelnino';

const obtenerSeccionDesdeRuta = () => {
  const path = window.location.pathname.toLowerCase();
  if (path === `${RUTA_ADMIN}/personal`) return 'personal';
  if (path === `${RUTA_ADMIN}/reportes`) return 'asistencia';
  if (path === `${RUTA_ADMIN}/sorteo`) return 'sorteo';
  return 'menu';
};

const obtenerRutaDeSeccion = (seccion) => {
  if (seccion === 'personal') return `${RUTA_ADMIN}/personal`;
  if (seccion === 'asistencia') return `${RUTA_ADMIN}/reportes`;
  if (seccion === 'sorteo') return `${RUTA_ADMIN}/sorteo`;
  return RUTA_ADMIN;
};

const cargarLogoComoDataUrl = () => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('No se pudo procesar el logo.'));
        return;
      }

      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('No se pudo cargar el logo.'));
    image.src = '/logo.PNG';
  });
};

const obtenerNumeroSorteo = (item, indexFallback = 0) => {
  const numero = Number.parseInt(item?.numeroSorteo ?? item?.numeroLista, 10);
  if (Number.isFinite(numero) && numero > 0) {
    return numero;
  }

  return indexFallback + 1;
};

function Administracion({ onVolver, onLogout }) {

  const [asistencias, setAsistencias] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    edad: '',
    sexo: 'Masculino',
    barrio_id: '',
    nombre_tutor: '',
  });

  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [eliminandoSeleccionados, setEliminandoSeleccionados] = useState(false);
  const [reporteBusqueda, setReporteBusqueda] = useState('');
  const [reporteBarrio, setReporteBarrio] = useState('todos');
  const [reporteEdadFiltro, setReporteEdadFiltro] = useState('todos');
  const [reporteEdadDesde, setReporteEdadDesde] = useState('');
  const [reporteEdadHasta, setReporteEdadHasta] = useState('');
  const [crudError, setCrudError] = useState('');
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [modalAlerta, setModalAlerta] = useState({ visible: false, tipo: 'info', titulo: '', mensaje: '' });
  const [seccionActiva, setSeccionActiva] = useState(obtenerSeccionDesdeRuta);
  const [modoCarga, setModoCarga] = useState('manual');
  const [csvFiltro, setCsvFiltro] = useState('todos');
  const [csvBusqueda, setCsvBusqueda] = useState('');
  const [fechaActual] = useState(() => new Date());
  const [cantidadSorteos, setCantidadSorteos] = useState('');
  const [resultadosSorteo, setResultadosSorteo] = useState([]);
  const [errorSorteo, setErrorSorteo] = useState('');
  const [mostrarParticipantesSorteo, setMostrarParticipantesSorteo] = useState(false);
  const [sorteoEnCurso, setSorteoEnCurso] = useState(false);
  const [ruletaValor, setRuletaValor] = useState('');
  const inputImportCsvRef = useRef(null);
  const [csvPreview, setCsvPreview] = useState({
    archivo: '',
    filas: [],
    errores: [],
    validos: 0,
    total: 0,
    puedeConfirmar: false,
    resumen: { total: 0, validos: 0, existentes: 0, errores: 0, duplicados: 0 },
  });
  const [ruletaDetalle, setRuletaDetalle] = useState('');
  const [modalGanador, setModalGanador] = useState({
    visible: false,
    nombre: '',
    dni: '',
    barrio: '',
    sorteoNumero: null,
  });
  const resolverModalGanadorRef = useRef(null);
  const [modalConfirmacion, setModalConfirmacion] = useState({
    visible: false,
    titulo: '',
    mensaje: '',
    textoAceptar: 'Aceptar',
    variante: 'primary',
  });
  const resolverConfirmacionRef = useRef(null);

  const solicitarConfirmacion = ({ titulo, mensaje, textoAceptar = 'Aceptar', variante = 'primary' }) => (
    new Promise((resolve) => {
      resolverConfirmacionRef.current = resolve;
      setModalConfirmacion({ visible: true, titulo, mensaje, textoAceptar, variante });
    })
  );

  const cerrarModalConfirmacion = (resultado) => {
    setModalConfirmacion((prev) => ({ ...prev, visible: false }));
    if (resolverConfirmacionRef.current) {
      resolverConfirmacionRef.current(resultado);
      resolverConfirmacionRef.current = null;
    }
  };

  const totalAsistencias = useMemo(() => asistencias.length, [asistencias]);

  const asistenciasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    if (!termino) {
      return asistencias;
    }

    return asistencias.filter((item) => {
      const texto = `${item.apellido} ${item.nombre} ${item.telefono} ${item.dni || item.email || ''}`.toLowerCase();
      return texto.includes(termino);
    });
  }, [asistencias, busqueda]);

  const participantesConNumero = useMemo(() => {
    return asistencias
      .map((item, index) => ({
        item,
        numero: obtenerNumeroSorteo(item, index),
      }))
      .sort((a, b) => a.numero - b.numero);
  }, [asistencias]);

  useEffect(() => {
    const cargarAsistencias = async () => {
      try {
        const data = await listarNinos();
        setAsistencias(Array.isArray(data) ? data : []);
      } catch (error) {
        setCrudError(error.message || 'No se pudo cargar el listado de niños.');
      }
    };
    cargarAsistencias();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setSeccionActiva(obtenerSeccionDesdeRuta());
    };

    window.addEventListener('popstate', onPopState);
    setSeccionActiva(obtenerSeccionDesdeRuta());

    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const irASeccion = (seccion) => {
    const ruta = obtenerRutaDeSeccion(seccion);
    window.history.pushState({ pantalla: 'administracion', seccion }, '', ruta);
    setSeccionActiva(seccion);
  };


  const onChangeFormulario = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setCrudError('');
  };

  const validarFormulario = () => {
    validarNinoFormulario(formData);
    return true;
  };

  const resetFormulario = () => {
    setFormData({
      nombre: '',
      apellido: '',
      dni: '',
      edad: '',
      sexo: 'Masculino',
      barrio_id: '',
      nombre_tutor: '',
    });
    setEditandoId(null);
    setCrudError('');
  };

  const onGuardarAsistencia = async (event) => {
    event.preventDefault();

    if (guardando) {
      return;
    }

    setGuardando(true);
    try {
      validarFormulario();

      const payload = {
        ...formData,
        edad: Number.parseInt(formData.edad, 10),
        dni: formData.dni,
        sexo: formData.sexo || 'Masculino',
        barrio_id: formData.barrio_id || formData.barrio || '',
        barrio: formData.barrio_id || formData.barrio || '',
      };

      let registroGuardado;
      if (editandoId) {
        registroGuardado = await actualizarNino(editandoId, payload);
        setAsistencias((prev) => prev.map((item) => (item.id === editandoId ? registroGuardado : item)));
        setModalAlerta({ visible: true, tipo: 'success', titulo: 'Actualización exitosa', mensaje: 'El niño fue actualizado correctamente.' });
      } else {
        registroGuardado = await guardarNino(payload);
        setAsistencias((prev) => [...prev, registroGuardado]);
        setModalAlerta({ visible: true, tipo: 'success', titulo: 'Registro exitoso', mensaje: 'El niño fue registrado correctamente.' });
      }

      resetFormulario();
    } catch (error) {
      const mensaje = error?.message || 'No se pudo guardar el niño.';
      setCrudError(mensaje);
      setModalAlerta({
        visible: true,
        tipo: 'error',
        titulo: 'Error',
        mensaje,
      });
    } finally {
      setGuardando(false);
    }
  };

  const onEditar = (asistencia) => {
    setEditandoId(asistencia.id);
    setFormData({
      nombre: asistencia.nombre || '',
      apellido: asistencia.apellido || '',
      dni: asistencia.dni || '',
      edad: asistencia.edad ?? '',
      sexo: asistencia.sexo || 'Masculino',
      barrio_id: asistencia.barrio_id || asistencia.barrio || '',
      nombre_tutor: asistencia.nombre_tutor || '',
    });
    irASeccion('personal');
  };

  const onEliminar = async (id) => {
    try {
      await eliminarNino(id);
      setAsistencias((prev) => prev.filter((item) => item.id !== id));
      setSeleccionados((prev) => {
        if (!prev.has(id)) {
          return prev;
        }
        const siguiente = new Set(prev);
        siguiente.delete(id);
        return siguiente;
      });
      if (editandoId === id) {
        resetFormulario();
      }
      setModalAlerta({ visible: true, tipo: 'success', titulo: 'Eliminado', mensaje: 'El niño fue eliminado correctamente.' });
    } catch (error) {
      setCrudError(error.message || 'No se pudo eliminar el niño.');
      setModalAlerta({ visible: true, tipo: 'error', titulo: 'Error', mensaje: error.message || 'No se pudo eliminar el niño.' });
    }
  };

  const onToggleSeleccion = (id) => {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) {
        siguiente.delete(id);
      } else {
        siguiente.add(id);
      }
      return siguiente;
    });
  };

  const todosFiltradosSeleccionados = asistenciasFiltradas.length > 0
    && asistenciasFiltradas.every((item) => seleccionados.has(item.id));

  const onToggleSeleccionarTodos = () => {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (todosFiltradosSeleccionados) {
        asistenciasFiltradas.forEach((item) => siguiente.delete(item.id));
      } else {
        asistenciasFiltradas.forEach((item) => siguiente.add(item.id));
      }
      return siguiente;
    });
  };

  const onEliminarSeleccionados = async () => {
    if (seleccionados.size === 0 || eliminandoSeleccionados) {
      return;
    }

    const cantidad = seleccionados.size;
    const confirmacion = await solicitarConfirmacion({
      titulo: 'Eliminar niños seleccionados',
      mensaje: `Se van a eliminar ${cantidad} niños. Esta acción no se puede deshacer.\n\n¿Desea continuar?`,
      textoAceptar: 'Eliminar',
      variante: 'danger',
    });

    if (!confirmacion) {
      return;
    }

    setEliminandoSeleccionados(true);
    try {
      const ids = Array.from(seleccionados);
      const { eliminados, fallidos } = await eliminarNinosEnLote(ids);
      const eliminadosSet = new Set(eliminados);

      setAsistencias((prev) => prev.filter((item) => !eliminadosSet.has(item.id)));
      setSeleccionados((prev) => {
        const siguiente = new Set(prev);
        eliminadosSet.forEach((id) => siguiente.delete(id));
        return siguiente;
      });

      if (editandoId && eliminadosSet.has(editandoId)) {
        resetFormulario();
      }

      if (fallidos.length > 0) {
        setModalAlerta({
          visible: true,
          tipo: 'warning',
          titulo: 'Eliminación parcial',
          mensaje: `Se eliminaron ${eliminados.length} niños. ${fallidos.length} no se pudieron eliminar.`,
        });
      } else {
        setModalAlerta({
          visible: true,
          tipo: 'success',
          titulo: 'Eliminados',
          mensaje: `Se eliminaron ${eliminados.length} niños correctamente.`,
        });
      }
    } catch (error) {
      const mensaje = error.message || 'No se pudieron eliminar los niños seleccionados.';
      setCrudError(mensaje);
      setModalAlerta({ visible: true, tipo: 'error', titulo: 'Error', mensaje });
    } finally {
      setEliminandoSeleccionados(false);
    }
  };

  const onDescargarPdf = async () => {
    if (asistenciasFiltradas.length === 0 || descargandoPdf) {
      return;
    }

    setDescargandoPdf(true);

    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const colorPrimario = [32, 78, 53];
      const colorSecundario = [231, 244, 230];
      const colorTextoSuave = [75, 94, 84];

      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, 0, pageWidth, 90, 'F');

      try {
        const logoDataUrl = await cargarLogoComoDataUrl();
        doc.addImage(logoDataUrl, 'PNG', 36, 18, 56, 56);
      } catch (error) {
        // Si el logo falla, el PDF se genera igual.
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text('Listado Fiesta Dia del Niño', 102, 42);
      doc.setFontSize(11);
      doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 102, 62);

      // Ordenar invitados por el orden de carga (numeroSorteo ascendente)
      const invitadosOrdenados = [...asistenciasFiltradas].sort((a, b) => {
        const nA = Number(a.numeroSorteo) || 0;
        const nB = Number(b.numeroSorteo) || 0;
        return nA - nB;
      });
      autoTable(doc, {
        startY: 110,
        head: [['N°', 'Apellido', 'Nombre', 'Telefono', 'DNI']],
        body: invitadosOrdenados.map((item, index) => [
          obtenerNumeroSorteo(item, index),
          item.apellido,
          item.nombre,
          item.telefono,
          item.dni || item.email,
        ]),
        theme: 'grid',
        headStyles: {
          fillColor: colorPrimario,
          textColor: [255, 255, 255],
        },
        alternateRowStyles: {
          fillColor: colorSecundario,
        },
        styles: {
          fontSize: 10,
          textColor: colorTextoSuave,
        },
      });

      doc.save('listado_fiesta_dia_del_nino.pdf');
    } finally {
      setDescargandoPdf(false);
    }
  };

  const esperar = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

  const esperarConfirmacionGanador = () => new Promise((resolve) => {
    resolverModalGanadorRef.current = resolve;
  });

  const onContinuarProximoSorteo = () => {
    setModalGanador((prev) => ({
      ...prev,
      visible: false,
    }));

    if (resolverModalGanadorRef.current) {
      resolverModalGanadorRef.current();
      resolverModalGanadorRef.current = null;
    }
  };

  const normalizarBarrioSlug = useCallback((valor) => {
    const texto = String(valor ?? '').trim();
    if (!texto) {
      return '';
    }

    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, []);

  const formatearBarrio = useCallback((valor) => {
    const slug = normalizarBarrioSlug(valor);
    const mapa = {
      'la-cancha': 'La Cancha',
      'el-bosque': 'El Bosque',
      'la-villa': 'La Villa',
      'el-fortin': 'El Fortín',
      'el-fortín': 'El Fortín',
      'fortin': 'El Fortín',
      'fortín': 'El Fortín',
    };

    return mapa[slug] || String(valor ?? '').trim() || 'Sin barrio';
  }, [normalizarBarrioSlug]);

  const obtenerFilasPlantilla = () => [
    { numero: 1, nombre: 'Ana', apellido: 'Perez', dni: '12345678', edad: '8', sexo: 'Femenino', barrio: 'La Cancha', nombre_tutor: 'Maria Perez' },
    { numero: 2, nombre: 'Lucas', apellido: 'Gomez', dni: '87654321', edad: '7', sexo: 'Masculino', barrio: 'La Villa', nombre_tutor: 'Luis Gomez' },
    { numero: 3, nombre: 'Sofia', apellido: 'Lopez', dni: '23456789', edad: '6', sexo: 'Femenino', barrio: 'El Bosque', nombre_tutor: 'Laura Lopez' },
  ];

  const csvFilasVisibles = useMemo(() => {
    const busquedaCsv = csvBusqueda.trim().toLowerCase();
    return csvPreview.filas.filter((item) => {
      const coincideFiltro = csvFiltro === 'todos'
        || item.estado === csvFiltro;

      if (!coincideFiltro) {
        return false;
      }

      if (!busquedaCsv) {
        return true;
      }

      const texto = [
        item.fila.nombre,
        item.fila.apellido,
        item.fila.dni,
      ].join(' ').toLowerCase();

      return texto.includes(busquedaCsv);
    });
  }, [csvPreview.filas, csvFiltro, csvBusqueda]);

  const reporteFiltrado = useMemo(() => {
    const termino = reporteBusqueda.trim().toLowerCase();

    return asistencias.filter((item) => {
      const barrioActual = normalizarBarrioSlug(item?.barrio_id || item?.barrio || '');
      const edadNumero = Number.parseInt(item?.edad, 10);
      const cumpleBusqueda = !termino || [item?.nombre, item?.apellido, item?.dni].join(' ').toLowerCase().includes(termino);
      const cumpleBarrio = reporteBarrio === 'todos' || barrioActual === reporteBarrio;

      let cumpleEdad = true;
      if (reporteEdadFiltro !== 'todos') {
        if (reporteEdadFiltro === 'custom') {
          const desde = Number.parseInt(reporteEdadDesde, 10);
          const hasta = Number.parseInt(reporteEdadHasta, 10);
          const tieneDesde = Number.isFinite(desde);
          const tieneHasta = Number.isFinite(hasta);

          if (tieneDesde && tieneHasta) {
            cumpleEdad = edadNumero >= desde && edadNumero <= hasta;
          } else if (tieneDesde) {
            cumpleEdad = edadNumero >= desde;
          } else if (tieneHasta) {
            cumpleEdad = edadNumero <= hasta;
          } else {
            cumpleEdad = true;
          }
        } else if (reporteEdadFiltro === '0-3') {
          cumpleEdad = edadNumero >= 0 && edadNumero <= 3;
        } else if (reporteEdadFiltro === '4-8') {
          cumpleEdad = edadNumero >= 4 && edadNumero <= 8;
        } else if (reporteEdadFiltro === '9-12') {
          cumpleEdad = edadNumero >= 9 && edadNumero <= 12;
        }
      }

      return cumpleBusqueda && cumpleBarrio && cumpleEdad;
    });
  }, [asistencias, reporteBarrio, reporteBusqueda, reporteEdadFiltro, reporteEdadDesde, reporteEdadHasta, normalizarBarrioSlug]);

  const resumenReporte = useMemo(() => {
    const total = reporteFiltrado.length;
    const masculinos = reporteFiltrado.filter((item) => String(item?.sexo || '').trim() === 'Masculino').length;
    const femeninos = reporteFiltrado.filter((item) => String(item?.sexo || '').trim() === 'Femenino').length;
    const otros = reporteFiltrado.filter((item) => String(item?.sexo || '').trim() === 'Otro').length;

    const porBarrio = ['la-cancha', 'el-bosque', 'la-villa', 'el-fortin']
      .map((slug) => ({
        slug,
        nombre: formatearBarrio(slug),
        total: reporteFiltrado.filter((item) => normalizarBarrioSlug(item?.barrio_id || item?.barrio || '') === slug).length,
      }))
      .filter((item) => item.total > 0);

    const porEdad = [
      { slug: '0-3', nombre: '0 a 3 años', total: reporteFiltrado.filter((item) => { const edad = Number.parseInt(item?.edad, 10); return Number.isFinite(edad) && edad >= 0 && edad <= 3; }).length },
      { slug: '4-8', nombre: '4 a 8 años', total: reporteFiltrado.filter((item) => { const edad = Number.parseInt(item?.edad, 10); return Number.isFinite(edad) && edad >= 4 && edad <= 8; }).length },
      { slug: '9-12', nombre: '9 a 12 años', total: reporteFiltrado.filter((item) => { const edad = Number.parseInt(item?.edad, 10); return Number.isFinite(edad) && edad >= 9 && edad <= 12; }).length },
      { slug: '13+', nombre: '13+ años', total: reporteFiltrado.filter((item) => { const edad = Number.parseInt(item?.edad, 10); return Number.isFinite(edad) && edad >= 13; }).length },
    ].filter((item) => item.total > 0);

    return { total, masculinos, femeninos, otros, porBarrio, porEdad };
  }, [reporteFiltrado, formatearBarrio, normalizarBarrioSlug]);

  const onDescargarReportePdf = async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const colorPrimario = [32, 78, 53];
    const colorSecundario = [231, 244, 230];
    const colorTextoSuave = [75, 94, 84];

    doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
    doc.rect(0, 0, pageWidth, 90, 'F');

    try {
      const logoDataUrl = await cargarLogoComoDataUrl();
      doc.addImage(logoDataUrl, 'PNG', 36, 18, 56, 56);
    } catch (error) {
      // No bloquea el PDF si el logo falla.
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Reporte de niños', 104, 42);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 104, 60);

    const filtros = [
      `Barrio: ${reporteBarrio === 'todos' ? 'Todos' : formatearBarrio(reporteBarrio)}`,
      `Edad: ${reporteEdadFiltro === 'todos' ? 'Todas' : reporteEdadFiltro === 'custom' ? `${reporteEdadDesde || 0} a ${reporteEdadHasta || 17}` : reporteEdadFiltro.replace('-', ' a ')}`,
      `Búsqueda: ${reporteBusqueda || 'Sin filtro'}`,
    ].join(' · ');

    doc.setTextColor(colorTextoSuave[0], colorTextoSuave[1], colorTextoSuave[2]);
    doc.setFontSize(10);
    doc.text(filtros, 36, 118);

    const filasResumen = [
      ['Total', resumenReporte.total],
      ['Masculinos', resumenReporte.masculinos],
      ['Femeninos', resumenReporte.femeninos],
      ['Otros', resumenReporte.otros],
    ];

    autoTable(doc, {
      startY: 138,
      head: [['Concepto', 'Cantidad']],
      body: filasResumen,
      theme: 'grid',
      headStyles: { fillColor: colorPrimario, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: colorSecundario },
      styles: { fontSize: 10, textColor: colorTextoSuave },
    });

    const barras = resumenReporte.porBarrio.length > 0
      ? resumenReporte.porBarrio.map((item) => [item.nombre, item.total])
      : [['Sin datos', 0]];

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 18,
      head: [['Barrio', 'Cantidad']],
      body: barras,
      theme: 'grid',
      headStyles: { fillColor: colorPrimario, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: colorSecundario },
      styles: { fontSize: 10, textColor: colorTextoSuave },
    });

    const edades = resumenReporte.porEdad.length > 0
      ? resumenReporte.porEdad.map((item) => [item.nombre, item.total])
      : [['Sin datos', 0]];

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 18,
      head: [['Rango de edad', 'Cantidad']],
      body: edades,
      theme: 'grid',
      headStyles: { fillColor: colorPrimario, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: colorSecundario },
      styles: { fontSize: 10, textColor: colorTextoSuave },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 18,
      head: [['Apellido', 'Nombre', 'Edad', 'Sexo', 'Barrio', 'DNI', 'Tutor']],
      body: reporteFiltrado.map((item) => [
        item.apellido || '-',
        item.nombre || '-',
        item.edad ?? '-',
        item.sexo || '-',
        formatearBarrio(item?.barrio_id || item?.barrio || ''),
        item.dni || '-',
        item.nombre_tutor || '-',
      ]),
      theme: 'grid',
      headStyles: { fillColor: colorPrimario, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: colorSecundario },
      styles: { fontSize: 8, textColor: colorTextoSuave },
      margin: { left: 36, right: 36 },
    });

    doc.save('reporte_ninos.pdf');
  };

  const onImportarCsv = async (event) => {
    const archivo = event.target.files?.[0];
    if (!archivo) {
      return;
    }

    const nombreArchivo = archivo.name.toLowerCase();
    if (!nombreArchivo.endsWith('.csv')) {
      const mensaje = 'Formato no válido. Solo se permiten archivos CSV.';
      setCsvPreview({
        archivo: archivo.name,
        filas: [],
        errores: [mensaje],
        validos: 0,
        total: 0,
        puedeConfirmar: false,
        resumen: { total: 0, validos: 0, existentes: 0, errores: 0, duplicados: 0 },
      });
      setCrudError(mensaje);
      event.target.value = '';
      return;
    }

    try {
      const contenido = await archivo.text();
      const filas = parsearCsv(contenido);

      if (!filas.length) {
        throw new Error('El CSV no tiene filas de datos.');
      }

      const columnasEsperadas = ['nombre', 'apellido', 'dni', 'edad', 'sexo', 'barrio', 'nombre_tutor'];
      const columnasArchivo = Object.keys(filas[0] || {});
      const faltantes = columnasEsperadas.filter((columna) => !columnasArchivo.includes(columna));
      const sobran = columnasArchivo.filter((columna) => !columnasEsperadas.includes(columna));

      if (faltantes.length || sobran.length) {
        const detalle = [];
        if (faltantes.length) detalle.push(`Faltan columnas: ${faltantes.join(', ')}`);
        if (sobran.length) detalle.push(`Columnas no permitidas: ${sobran.join(', ')}`);
        throw new Error(detalle.join('. '));
      }

      const registrosExistentes = await listarNinos();
      const dnisRegistrados = new Set(registrosExistentes.map((nino) => normalizarDni(nino?.dni)).filter(Boolean));
      const conteoDniEnArchivo = new Map();
      const previewFilas = filas.map((fila, index) => {
        const filaNormalizada = normalizarFilaNinoDesdeCsv(fila);
        const dniNormalizado = normalizarDni(filaNormalizada.dni);
        const edadNumerica = Number.parseInt(filaNormalizada.edad, 10);
        const sexoNormalizado = String(filaNormalizada.sexo || '').trim();
        const barrioNormalizado = String(filaNormalizada.barrio_id || filaNormalizada.barrio || '').trim();
        const errores = [];

        if (!filaNormalizada.nombre?.trim()) errores.push('Falta el nombre.');
        if (!filaNormalizada.apellido?.trim()) errores.push('Falta el apellido.');
        if (!dniNormalizado) {
          errores.push('El DNI es obligatorio.');
        } else if (!/^\d{7,9}$/.test(dniNormalizado)) {
          errores.push('El DNI debe contener solo números y tener entre 7 y 9 caracteres.');
        }

        if (filaNormalizada.edad === undefined || filaNormalizada.edad === null || String(filaNormalizada.edad).trim() === '') {
          errores.push('La edad es obligatoria.');
        } else if (!Number.isFinite(edadNumerica)) {
          errores.push('La edad debe ser un número.');
        } else if (edadNumerica < 0 || edadNumerica > 17) {
          errores.push('La edad debe estar entre 0 y 17 años.');
        }

        if (!['Masculino', 'Femenino', 'Otro'].includes(sexoNormalizado)) {
          errores.push('El sexo no es válido.');
        }

        if (!barrioNormalizado) {
          errores.push('Debe indicar un barrio válido.');
        }

        const dniExistente = dniNormalizado && dnisRegistrados.has(dniNormalizado);
        const dniDuplicado = dniNormalizado && (conteoDniEnArchivo.get(dniNormalizado) || 0) > 0;

        if (dniNormalizado) {
          conteoDniEnArchivo.set(dniNormalizado, (conteoDniEnArchivo.get(dniNormalizado) || 0) + 1);
        }

        if (dniExistente) {
          errores.push(`El DNI ${dniNormalizado} ya existe en el sistema.`);
        }
        if (dniDuplicado) {
          errores.push(`El DNI ${dniNormalizado} aparece varias veces dentro del CSV.`);
        }

        let estado = 'error';
        if (errores.length === 0) {
          estado = 'valido';
        } else if (dniExistente) {
          estado = 'ya_existe';
        } else if (dniDuplicado) {
          estado = 'duplicado';
        }

        return {
          index: index + 2,
          fila: {
            nombre: String(filaNormalizada.nombre || '').trim(),
            apellido: String(filaNormalizada.apellido || '').trim(),
            dni: dniNormalizado,
            edad: edadNumerica,
            sexo: sexoNormalizado,
            barrio: barrioNormalizado,
            barrio_id: barrioNormalizado,
            nombre_tutor: String(filaNormalizada.nombre_tutor || '').trim(),
          },
          errores,
          valido: errores.length === 0,
          estado,
          detalle: estado === 'valido'
            ? 'Se puede importar'
            : estado === 'ya_existe'
              ? `El DNI ${dniNormalizado} ya existe en el sistema.`
              : estado === 'duplicado'
                ? `El DNI ${dniNormalizado} aparece varias veces en este archivo.`
                : errores.join(' '),
        };
      });

      const resumen = {
        total: previewFilas.length,
        validos: previewFilas.filter((item) => item.estado === 'valido').length,
        existentes: previewFilas.filter((item) => item.estado === 'ya_existe').length,
        errores: previewFilas.filter((item) => item.estado === 'error').length,
        duplicados: previewFilas.filter((item) => item.estado === 'duplicado').length,
      };

      setCsvPreview({
        archivo: archivo.name,
        filas: previewFilas,
        errores: previewFilas.flatMap((item) => item.errores.map((error) => `Fila ${item.index}: ${error}`)),
        validos: resumen.validos,
        total: resumen.total,
        puedeConfirmar: resumen.validos > 0,
        resumen,
      });
      setCrudError('');
    } catch (error) {
      setCsvPreview({
        archivo: archivo.name,
        filas: [],
        errores: [error.message || 'No se pudo leer el CSV.'],
        validos: 0,
        total: 0,
        puedeConfirmar: false,
        resumen: { total: 0, validos: 0, existentes: 0, errores: 0, duplicados: 0 },
      });
      setCrudError(error.message || 'No se pudo leer el CSV.');
    } finally {
      event.target.value = '';
    }
  };

  const confirmarImportacionCsv = async () => {
    if (!csvPreview.filas.length || !csvPreview.puedeConfirmar) {
      return;
    }

    const filasValidas = csvPreview.filas
      .filter((item) => item.valido)
      .map((item) => ({
        ...item.fila,
        barrio_id: item.fila.barrio_id || item.fila.barrio || '',
      }));
    if (!filasValidas.length) {
      setCrudError('No hay registros válidos para importar.');
      return;
    }

    const confirmacion = await solicitarConfirmacion({
      titulo: 'Confirmar importación',
      mensaje: `Se van a importar ${filasValidas.length} niños.\n` +
        `${csvPreview.resumen?.existentes || 0} registros ya existen y serán omitidos.\n` +
        `${csvPreview.resumen?.errores || 0} registros con errores serán omitidos.\n` +
        `${csvPreview.resumen?.duplicados || 0} registros duplicados dentro del archivo serán omitidos.\n\n¿Desea continuar?`,
      textoAceptar: 'Importar',
      variante: 'primary',
    });

    if (!confirmacion) {
      return;
    }

    try {
      setGuardando(true);
      const { insertados, fallidos } = await crearNinosEnLote(filasValidas);
      const importados = insertados.length;

      const dataActualizada = await listarNinos();
      setAsistencias(dataActualizada);

      if (fallidos.length > 0) {
        const mensajesAMostrar = fallidos.slice(0, 20).map((item) => item.message);
        const mensaje = mensajesAMostrar.join(' ')
          + (fallidos.length > mensajesAMostrar.length ? ` (y ${fallidos.length - mensajesAMostrar.length} error/es más)` : '');
        setModalAlerta({
          visible: true,
          tipo: 'warning',
          titulo: 'Importación parcial',
          mensaje: `Se importaron ${importados} registros correctamente. ${fallidos.length} no pudieron insertarse. ${mensaje}`,
        });
      } else {
        setModalAlerta({
          visible: true,
          tipo: 'success',
          titulo: 'Importación completada',
          mensaje: `Se importaron ${importados} registros correctamente.`,
        });
      }

      setCsvPreview({
        archivo: '',
        filas: [],
        errores: [],
        validos: 0,
        total: 0,
        puedeConfirmar: false,
        resumen: { total: 0, validos: 0, existentes: 0, errores: 0, duplicados: 0 },
      });
      setCrudError('');
    } catch (error) {
      setCrudError(error.message || 'No se pudo confirmar la importación.');
      setModalAlerta({
        visible: true,
        tipo: 'error',
        titulo: 'Error al confirmar',
        mensaje: error.message || 'No se pudo confirmar la importación.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const onGenerarSorteo = async () => {
    setErrorSorteo('');
    setResultadosSorteo([]);
    setRuletaValor('');
    setModalGanador({
      visible: false,
      nombre: '',
      dni: '',
      barrio: '',
      sorteoNumero: null,
    });

    const totalParticipantes = participantesConNumero.length;
    const cantidad = Number.parseInt(cantidadSorteos, 10);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setErrorSorteo('Ingresa una cantidad de sorteos valida.');
      return;
    }

    if (totalParticipantes === 0) {
      setErrorSorteo('No hay niños cargados para sortear.');
      return;
    }

    if (cantidad > totalParticipantes) {
      setErrorSorteo('La cantidad de sorteos no puede superar la cantidad de niños cargados.');
      return;
    }

    setSorteoEnCurso(true);

    try {
      const resultados = [];
      const candidatosDisponibles = [...participantesConNumero];

      for (let i = 0; i < cantidad; i += 1) {
        if (candidatosDisponibles.length === 0) {
          continue;
        }

        setRuletaDetalle(`Sorteo ${i + 1} de ${cantidad}`);

        const vueltas = 24 + Math.floor(Math.random() * 10);
        const offset = Math.floor(Math.random() * candidatosDisponibles.length);
        for (let paso = 0; paso < vueltas; paso += 1) {
          const indiceVisual = (paso + offset) % candidatosDisponibles.length;
          const candidatoVisual = candidatosDisponibles[indiceVisual];
          setRuletaValor(`${candidatoVisual.item.nombre} ${candidatoVisual.item.apellido}`);
          await esperar(60 + paso * 7);
        }

        const indiceGanador = Math.floor(Math.random() * candidatosDisponibles.length);
        const ganador = candidatosDisponibles[indiceGanador];
        setRuletaValor(`${ganador.item.nombre} ${ganador.item.apellido}`);
        await esperar(500);

        resultados.push({
          sorteoNumero: i + 1,
          ganador: ganador.item,
        });

        setModalGanador({
          visible: true,
          nombre: `${ganador.item.apellido}, ${ganador.item.nombre}`,
          dni: ganador.item.dni || '-',
          barrio: formatearBarrio(ganador.item.barrio_id || ganador.item.barrio),
          sorteoNumero: i + 1,
        });
        await esperarConfirmacionGanador();

        candidatosDisponibles.splice(indiceGanador, 1);
      }

      setResultadosSorteo(resultados);
      setRuletaDetalle('Sorteo finalizado');
    } finally {
      resolverModalGanadorRef.current = null;
      setSorteoEnCurso(false);
    }
  };

  const onLimpiarSorteo = () => {
    setResultadosSorteo([]);
    setRuletaValor('');
    setRuletaDetalle('');
    setErrorSorteo('');
    setCantidadSorteos('');
  };


  return (
    <main className="admin-page">
      <ModalAlerta
        visible={modalAlerta.visible}
        tipo={modalAlerta.tipo}
        titulo={modalAlerta.titulo}
        mensaje={modalAlerta.mensaje}
        onClose={() => setModalAlerta((prev) => ({ ...prev, visible: false }))}
      />
      {modalConfirmacion.visible ? (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-modal-confirm">
            <div className={`admin-modal-confirm-icon admin-modal-confirm-icon-${modalConfirmacion.variante}`} aria-hidden="true">
              {modalConfirmacion.variante === 'danger' ? '!' : '?'}
            </div>
            <h3 className="admin-modal-confirm-title">{modalConfirmacion.titulo}</h3>
            <p className="admin-modal-confirm-mensaje">{modalConfirmacion.mensaje}</p>
            <div className="admin-modal-confirm-acciones">
              <button
                type="button"
                className="admin-button secondary"
                onClick={() => cerrarModalConfirmacion(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`admin-button ${modalConfirmacion.variante}`}
                onClick={() => cerrarModalConfirmacion(true)}
              >
                {modalConfirmacion.textoAceptar}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="admin-panel">
        <header className="admin-header">
          <nav className="admin-topbar" aria-label="Navegacion principal administracion">
            <button
              type="button"
              className="admin-top-icon"
              onClick={() => irASeccion('menu')}
              aria-label="Ir al dashboard"
            >
              ⌂
            </button>

            <p className="admin-topbar-title">Comuna La Florida y Luisiana</p>

            {typeof onLogout === 'function' && (
              <button
                type="button"
                className="admin-top-icon"
                style={{ marginLeft: 'auto' }}
                onClick={onLogout}
                aria-label="Cerrar sesión"
              >
                Salir
              </button>
            )}
          </nav>
        </header>

        <section className="admin-route-shell">
          {seccionActiva === 'menu' ? (
            <>
              <div className="admin-dashboard-welcome">
                <h2 className="admin-dashboard-title">
                  Bienvenido, <span>Administrador</span>
                </h2>
                <p className="admin-dashboard-subtitle">Fiesta Dia del Niño</p>
              </div>

              <h3 className="admin-modules-title">
                <span className="admin-modules-mark" />
                Modulos del sistema
              </h3>

              <div className="admin-route-grid">
                <article className="admin-route-card">
                  <div className="admin-route-card-bg" />
                  <div className="admin-route-head">
                    <span className="admin-route-tag">NIÑOS</span>
                  </div>
                  <h2 className="admin-route-title">Niños</h2>
                  <p className="admin-route-text">Alta, edición y listado completo de los niños del evento.</p>
                  <button type="button" className="admin-route-arrow" onClick={() => irASeccion('personal')}>
                    Ingresar
                  </button>
                </article>

                <article className="admin-route-card">
                  <div className="admin-route-card-bg" />
                  <div className="admin-route-head">
                    <span className="admin-route-tag">REPORTES</span>
                  </div>
                  <h2 className="admin-route-title">Reporte de niños</h2>
                  <p className="admin-route-text">Resumen estadístico y filtros para consultar la nómina registrada.</p>
                  <button type="button" className="admin-route-arrow" onClick={() => irASeccion('asistencia')}>
                    Ingresar
                  </button>
                </article>

                <article className="admin-route-card">
                  <div className="admin-route-card-bg" />
                  <div className="admin-route-head">
                    
                    <span className="admin-route-tag">SORTEO</span>
                  </div>
                  <h2 className="admin-route-title">Sorteo</h2>
                  <p className="admin-route-text">Listado de presentes para realizar sorteos del evento.</p>
                  <button type="button" className="admin-route-arrow" onClick={() => irASeccion('sorteo')}>
                    Ingresar
                  </button>
                </article>
              </div>

              <div className="admin-dashboard-footer">
                <span>Fiesta del Día del Niño · Administracion</span>
                <span>Ultima actualizacion: {fechaActual.toLocaleString('es-AR')}</span>
              </div>
            </>
          ) : null}

          {seccionActiva === 'personal' ? (
            <article className="admin-card">
              <h2 className="admin-section-title">Niños</h2>
              <p className="admin-subtitle">Total de niños registrados: {totalAsistencias}</p>

              <div className="admin-carga-selector">
                <button
                  type="button"
                  className={`admin-carga-option ${modoCarga === 'manual' ? 'selected' : ''}`}
                  onClick={() => setModoCarga('manual')}
                >
                  <span className="admin-carga-option-title">CARGA MANUAL</span>
                  <span className="admin-carga-option-desc">Agregar un niño completando el formulario.</span>
                </button>

                <button
                  type="button"
                  className={`admin-carga-option ${modoCarga === 'csv' ? 'selected' : ''}`}
                  onClick={() => setModoCarga('csv')}
                >
                  <span className="admin-carga-option-title">IMPORTAR CSV</span>
                  <span className="admin-carga-option-desc">Agregar muchos niños mediante un archivo CSV.</span>
                </button>
              </div>

              {modoCarga === 'manual' ? (
                <>
                  <h3 className="admin-subcard-title">{editandoId ? 'Editar niño' : 'Nuevo niño'}</h3>
                  <form className="admin-form" onSubmit={onGuardarAsistencia} noValidate>
                    <div className="admin-form-grid">
                      <div className="admin-form-field">
                        <label htmlFor="nombre" className="admin-label">Nombre *</label>
                        <input id="nombre" name="nombre" type="text" className="admin-input" value={formData.nombre} onChange={onChangeFormulario} />
                      </div>

                      <div className="admin-form-field">
                        <label htmlFor="apellido" className="admin-label">Apellido *</label>
                        <input id="apellido" name="apellido" type="text" className="admin-input" value={formData.apellido} onChange={onChangeFormulario} />
                      </div>

                      <div className="admin-form-field">
                        <label htmlFor="dni" className="admin-label">DNI *</label>
                        <input id="dni" name="dni" type="text" inputMode="numeric" className="admin-input" value={formData.dni} onChange={onChangeFormulario} />
                      </div>

                      <div className="admin-form-field">
                        <label htmlFor="edad" className="admin-label">Edad *</label>
                        <input id="edad" name="edad" type="number" min="0" max="17" className="admin-input" value={formData.edad} onChange={onChangeFormulario} />
                      </div>

                      <div className="admin-form-field">
                        <label htmlFor="sexo" className="admin-label">Sexo *</label>
                        <select id="sexo" name="sexo" className="admin-input" value={formData.sexo} onChange={onChangeFormulario}>
                          <option value="Masculino">Masculino</option>
                          <option value="Femenino">Femenino</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>

                      <div className="admin-form-field">
                        <label htmlFor="barrio" className="admin-label">Barrio *</label>
                        <select id="barrio" name="barrio_id" className="admin-input" value={formData.barrio_id} onChange={onChangeFormulario}>
                          <option value="">Selecciona un barrio</option>
                          <option value="la-cancha">La Cancha</option>
                          <option value="el-bosque">El Bosque</option>
                          <option value="la-villa">La Villa</option>
                          <option value="el-fortin">El Fortin</option>
                        </select>
                      </div>

                      <div className="admin-form-field admin-form-field-full">
                        <label htmlFor="nombre_tutor" className="admin-label">Nombre del tutor</label>
                        <input id="nombre_tutor" name="nombre_tutor" type="text" className="admin-input" value={formData.nombre_tutor} onChange={onChangeFormulario} />
                      </div>
                    </div>

                    {crudError ? <p className="admin-error">{crudError}</p> : null}

                    <button type="submit" className="admin-button primary" disabled={guardando}>
                      {guardando ? 'Guardando...' : (editandoId ? 'Guardar cambios' : 'Agregar niño')}
                    </button>
                    <button type="button" className="admin-button secondary" onClick={resetFormulario}>Limpiar</button>
                  </form>
                </>
              ) : (
                <>
                  <div className="admin-import-header-banner">
                    <h3>Importar nómina desde CSV</h3>
                  </div>

                  <div className="admin-import-format-box">
                    <div className="admin-import-format-header">
                      <h4 className="admin-import-format-title">Formato requerido del CSV</h4>
                    </div>
                    <p className="admin-import-format-text">
                      El archivo debe contener estas columnas.
                    </p>
                    
                    <div className="admin-import-format-table-wrap">
                      <table className="admin-import-format-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>nombre</th>
                            <th>apellido</th>
                            <th>dni</th>
                            <th>edad</th>
                            <th>sexo</th>
                            <th>barrio</th>
                            <th>nombre_tutor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {obtenerFilasPlantilla().map((fila) => (
                            <tr key={`plantilla-${fila.numero}`}>
                              <td>{fila.numero}</td>
                              <td>{fila.nombre}</td>
                              <td>{fila.apellido}</td>
                              <td>{fila.dni}</td>
                              <td>{fila.edad}</td>
                              <td>{fila.sexo}</td>
                              <td>{fila.barrio}</td>
                              <td>{fila.nombre_tutor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>


                    <p className="admin-import-format-note">Solo se aceptan archivos .csv</p>
                  </div>

                  <div className="admin-import-actions">
                    <button type="button" className="admin-button primary admin-import-main-btn" onClick={() => inputImportCsvRef.current?.click()} disabled={guardando}>
                      {guardando ? 'Procesando...' : '📥 Importar archivo CSV'}
                    </button>
                  </div>

                  {csvPreview.archivo ? (
                    <div className="admin-import-preview">
                      <div className="admin-import-preview-header">
                        <div>
                          <p className="admin-import-format-title">Vista previa del archivo</p>
                          <p className="admin-import-preview-file">{csvPreview.archivo}</p>
                        </div>
                        <div className="admin-import-preview-actions">
                          <button
                            type="button"
                            className="admin-button primary"
                            onClick={confirmarImportacionCsv}
                            disabled={!csvPreview.puedeConfirmar || guardando}
                          >
                            {guardando ? 'Confirmando...' : `Importar ${csvPreview.resumen?.validos || 0} registros válidos`}
                          </button>
                          <button
                            type="button"
                            className="admin-button secondary"
                            onClick={() => {
                              setCsvPreview({
                                archivo: '',
                                filas: [],
                                errores: [],
                                validos: 0,
                                total: 0,
                                puedeConfirmar: false,
                                resumen: { total: 0, validos: 0, existentes: 0, errores: 0, duplicados: 0 },
                              });
                              setCsvBusqueda('');
                              setCsvFiltro('todos');
                            }}
                            disabled={guardando}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>

                      <div className="admin-preview-summary">
                        <div className="admin-summary-card">
                          <span>Total</span>
                          <strong>{csvPreview.resumen?.total || 0}</strong>
                        </div>
                        <div className="admin-summary-card valid">
                          <span>Válidos</span>
                          <strong>{csvPreview.resumen?.validos || 0}</strong>
                        </div>
                        <div className="admin-summary-card existing">
                          <span>Ya existen</span>
                          <strong>{csvPreview.resumen?.existentes || 0}</strong>
                        </div>
                        <div className="admin-summary-card error">
                          <span>Errores</span>
                          <strong>{csvPreview.resumen?.errores || 0}</strong>
                        </div>
                        <div className="admin-summary-card duplicate">
                          <span>Duplicados</span>
                          <strong>{csvPreview.resumen?.duplicados || 0}</strong>
                        </div>
                      </div>

                      <div className="admin-import-filters">
                        <button type="button" className={csvFiltro === 'todos' ? 'selected' : ''} onClick={() => setCsvFiltro('todos')}>Todos</button>
                        <button type="button" className={csvFiltro === 'valido' ? 'selected' : ''} onClick={() => setCsvFiltro('valido')}>Válidos</button>
                        <button type="button" className={csvFiltro === 'error' ? 'selected' : ''} onClick={() => setCsvFiltro('error')}>Con errores</button>
                        <button type="button" className={csvFiltro === 'ya_existe' ? 'selected' : ''} onClick={() => setCsvFiltro('ya_existe')}>Ya existen</button>
                        <button type="button" className={csvFiltro === 'duplicado' ? 'selected' : ''} onClick={() => setCsvFiltro('duplicado')}>Duplicados</button>
                        <input
                          type="text"
                          className="admin-input"
                          value={csvBusqueda}
                          onChange={(event) => setCsvBusqueda(event.target.value)}
                          placeholder="Buscar por nombre, apellido o DNI"
                        />
                      </div>

                      {csvPreview.errores.length > 0 ? (
                        <div className="admin-import-errors">
                          <ul>
                            {csvPreview.errores.map((error, index) => (
                              <li key={`${error}-${index}`}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="admin-import-table-wrap">
                        <table className="admin-import-preview-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Nombre</th>
                              <th>Apellido</th>
                              <th>DNI</th>
                              <th>Edad</th>
                              <th>Sexo</th>
                              <th>Barrio</th>
                              <th>Tutor</th>
                              <th>Estado</th>
                              <th>Detalle</th>
                            </tr>
                          </thead>
                          <tbody>
                            {csvFilasVisibles.map((item) => {
                              const estadoEmoji = item.estado === 'valido' ? '✅' : item.estado === 'ya_existe' ? '⚠️' : item.estado === 'duplicado' ? '⚠️' : '❌';
                              const estadoTexto = item.estado === 'valido' ? 'Válido' : item.estado === 'ya_existe' ? 'Ya existe' : item.estado === 'duplicado' ? 'Duplicado' : 'Error';
                              return (
                                <tr key={`csv-row-${item.index}`} className={`admin-import-row admin-import-row-${item.estado}`}>
                                  <td>{item.index}</td>
                                  <td>{item.fila.nombre || '-'}</td>
                                  <td>{item.fila.apellido || '-'}</td>
                                  <td>{item.fila.dni || '-'}</td>
                                  <td>{item.fila.edad || '-'}</td>
                                  <td>{item.fila.sexo || '-'}</td>
                                  <td>{item.fila.barrio || '-'}</td>
                                  <td>{item.fila.nombre_tutor || '-'}</td>
                                  <td className={`admin-import-estado admin-import-estado-${item.estado}`}>
                                    {estadoEmoji} {estadoTexto}
                                  </td>
                                  <td className="admin-import-detalle">{item.detalle || '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <input
                    ref={inputImportCsvRef}
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={onImportarCsv}
                  />
                </>
              )}

              <div className="admin-subcard-header">
                <h3 className="admin-subcard-title">Lista de niños</h3>
                <div className="admin-header-actions">
                  <input
                    type="text"
                    className="admin-input admin-search-input"
                    placeholder="Buscar por apellido, nombre o DNI"
                    value={busqueda}
                    onChange={async (event) => {
                      const valor = event.target.value;
                      setBusqueda(valor);
                      try {
                        const data = await buscarNinos(valor);
                        setAsistencias(data);
                      } catch (error) {
                        setCrudError(error.message || 'No se pudo buscar niños.');
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="admin-button primary"
                    onClick={onDescargarPdf}
                    disabled={asistenciasFiltradas.length === 0 || descargandoPdf}
                  >
                    {descargandoPdf ? 'Generando PDF...' : 'Descargar PDF'}
                  </button>
                  <button
                    type="button"
                    className="admin-button danger"
                    onClick={onEliminarSeleccionados}
                    disabled={seleccionados.size === 0 || eliminandoSeleccionados}
                  >
                    {eliminandoSeleccionados
                      ? 'Eliminando...'
                      : `Eliminar seleccionados${seleccionados.size > 0 ? ` (${seleccionados.size})` : ''}`}
                  </button>
                </div>
              </div>

              {asistenciasFiltradas.length === 0 ? (
                <p className="admin-empty">
                  {asistencias.length === 0 ? 'Todavía no hay niños registrados.' : 'No hay resultados para la búsqueda actual.'}
                </p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={todosFiltradosSeleccionados}
                            onChange={onToggleSeleccionarTodos}
                            aria-label="Seleccionar todos los niños listados"
                          />
                        </th>
                        <th>N°</th>
                        <th>Apellido</th>
                        <th>Nombre</th>
                        <th>Edad</th>
                        <th>Sexo</th>
                        <th>Barrio</th>
                        <th>DNI</th>
                        <th>Tutor</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asistenciasFiltradas.map((asistencia, index) => (
                        <tr key={asistencia.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={seleccionados.has(asistencia.id)}
                              onChange={() => onToggleSeleccion(asistencia.id)}
                              aria-label={`Seleccionar ${asistencia.nombre} ${asistencia.apellido}`}
                            />
                          </td>
                          <td>{obtenerNumeroSorteo(asistencia, index)}</td>
                          <td>{asistencia.apellido}</td>
                          <td>{asistencia.nombre}</td>
                          <td>{asistencia.edad ?? '-'}</td>
                          <td>{asistencia.sexo || '-'}</td>
                          <td>{asistencia.barrio || '-'}</td>
                          <td>{asistencia.dni || asistencia.email || '-'}</td>
                          <td>{asistencia.nombre_tutor || '-'}</td>
                          <td className="admin-actions-cell">
                            <button type="button" className="admin-inline-btn edit" onClick={() => onEditar(asistencia)}>Editar</button>
                            <button type="button" className="admin-inline-btn delete" onClick={() => onEliminar(asistencia.id)}>Eliminar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          ) : null}

          {seccionActiva === 'asistencia' ? (
            <article className="admin-card admin-mini-card admin-report-card">
              <div className="admin-subcard-header admin-report-header">
                <div>
                  <h2 className="admin-section-title" style={{ margin: 0 }}>Reporte de niños</h2>
                  <p className="admin-subtitle" style={{ margin: '0.2rem 0 0' }}>Nómina filtrada por barrio, edad y búsqueda.</p>
                </div>
                <button
                  type="button"
                  className="admin-button primary"
                  onClick={onDescargarReportePdf}
                  disabled={reporteFiltrado.length === 0 || descargandoPdf}
                >
                  {descargandoPdf ? 'Generando PDF...' : 'Imprimir / Descargar PDF'}
                </button>
              </div>

              <div className="admin-report-summary">
                <div className="admin-summary-card valid">
                  <span>Total</span>
                  <strong>{resumenReporte.total}</strong>
                </div>
                <div className="admin-summary-card">
                  <span>Masculinos</span>
                  <strong>{resumenReporte.masculinos}</strong>
                </div>
                <div className="admin-summary-card">
                  <span>Femeninos</span>
                  <strong>{resumenReporte.femeninos}</strong>
                </div>
                <div className="admin-summary-card">
                  <span>Otros</span>
                  <strong>{resumenReporte.otros}</strong>
                </div>
              </div>

              <div className="admin-report-filters">
                <div className="admin-report-filter-field">
                  <label className="admin-label" htmlFor="reporte-barrio">Barrio</label>
                  <select
                    id="reporte-barrio"
                    className="admin-input"
                    value={reporteBarrio}
                    onChange={(event) => setReporteBarrio(event.target.value)}
                  >
                    <option value="todos">Todos</option>
                    <option value="la-cancha">La Cancha</option>
                    <option value="el-bosque">El Bosque</option>
                    <option value="la-villa">La Villa</option>
                    <option value="el-fortin">El Fortín</option>
                  </select>
                </div>

                <div className="admin-report-filter-field">
                  <label className="admin-label" htmlFor="reporte-edad">Por edad</label>
                  <select
                    id="reporte-edad"
                    className="admin-input"
                    value={reporteEdadFiltro}
                    onChange={(event) => setReporteEdadFiltro(event.target.value)}
                  >
                    <option value="todos">Todos</option>
                    <option value="0-3">0 a 3 años</option>
                    <option value="4-8">4 a 8 años</option>
                    <option value="9-12">9 a 12 años</option>
                    <option value="13+">13+ años</option>
                    <option value="custom">Rango personalizado</option>
                  </select>
                </div>

                <div className="admin-report-filter-field admin-report-custom-age">
                  <label className="admin-label" htmlFor="edad-desde">Desde</label>
                  <input
                    id="edad-desde"
                    type="number"
                    min="0"
                    max="17"
                    className="admin-input"
                    value={reporteEdadDesde}
                    onChange={(event) => setReporteEdadDesde(event.target.value)}
                    placeholder="Desde"
                    disabled={reporteEdadFiltro !== 'custom'}
                  />
                </div>

                <div className="admin-report-filter-field admin-report-custom-age">
                  <label className="admin-label" htmlFor="edad-hasta">Hasta</label>
                  <input
                    id="edad-hasta"
                    type="number"
                    min="0"
                    max="17"
                    className="admin-input"
                    value={reporteEdadHasta}
                    onChange={(event) => setReporteEdadHasta(event.target.value)}
                    placeholder="Hasta"
                    disabled={reporteEdadFiltro !== 'custom'}
                  />
                </div>

                <div className="admin-report-search">
                  <label className="admin-label" htmlFor="reporte-busqueda">Buscar</label>
                  <input
                    id="reporte-busqueda"
                    type="text"
                    className="admin-input"
                    value={reporteBusqueda}
                    onChange={(event) => setReporteBusqueda(event.target.value)}
                    placeholder="Nombre, apellido o DNI"
                  />
                </div>
              </div>

              {reporteFiltrado.length === 0 ? (
                <p className="admin-empty">No hay resultados para los filtros seleccionados.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table admin-report-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Apellido</th>
                        <th>Nombre</th>
                        <th>Edad</th>
                        <th>Sexo</th>
                        <th>Barrio</th>
                        <th>DNI</th>
                        <th>Tutor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporteFiltrado.map((item, index) => (
                        <tr key={`reporte-${item.id ?? index}`}>
                          <td>{index + 1}</td>
                          <td>{item.apellido || '-'}</td>
                          <td>{item.nombre || '-'}</td>
                          <td>{item.edad ?? '-'}</td>
                          <td>{item.sexo || '-'}</td>
                          <td>{formatearBarrio(item?.barrio_id || item?.barrio || '')}</td>
                          <td>{item.dni || '-'}</td>
                          <td>{item.nombre_tutor || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          ) : null}

          {seccionActiva === 'sorteo' ? (
            <article className="admin-card admin-mini-card admin-sorteo-card">
              <div className="admin-sorteo-header">
                <span className="admin-sorteo-header-icon" aria-hidden="true">🎉</span>
                <div>
                  <h2 className="admin-section-title admin-sorteo-title">Sorteo</h2>
                </div>
              </div>

              <div className={`admin-ruleta ${sorteoEnCurso ? 'is-spinning' : ''}`}>
                <p className="admin-ruleta-detail">{ruletaDetalle || 'Configura la cantidad y genera la ruleta por nombre y DNI'}</p>
                <div className="admin-ruleta-wheel">
                  <span className="admin-ruleta-pointer" aria-hidden="true" />
                  <p className="admin-ruleta-number admin-ruleta-nombre">{ruletaValor || '--'}</p>
                </div>
              </div>

              <div className="admin-sorteo-controls">
                <label htmlFor="cantidadSorteos" className="admin-label">Cantidad de sorteos</label>
                <div className="admin-sorteo-actions">
                  <input
                    id="cantidadSorteos"
                    type="number"
                    min="1"
                    className="admin-input"
                    value={cantidadSorteos}
                    onChange={(event) => setCantidadSorteos(event.target.value)}
                    placeholder="Ej: 7"
                  />
                  <button
                    type="button"
                    className="admin-button primary admin-sorteo-btn"
                    onClick={onGenerarSorteo}
                    disabled={sorteoEnCurso}
                  >
                    {sorteoEnCurso ? 'Girando ruleta...' : '🎲 Generar sorteo'}
                  </button>
                </div>
              </div>

              {errorSorteo ? <p className="admin-error">{errorSorteo}</p> : null}

              {resultadosSorteo.length > 0 ? (
                <div className="admin-sorteo-results">
                  <div className="admin-sorteo-results-header">
                    <h3 className="admin-subcard-title">🏆 Ganadores</h3>
                    <button
                      type="button"
                      className="admin-button secondary"
                      onClick={onLimpiarSorteo}
                      disabled={sorteoEnCurso}
                    >
                      Limpiar y preparar próximo sorteo
                    </button>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-sorteo-results-table">
                      <thead>
                        <tr>
                          <th>Sorteo</th>
                          <th>Nombre</th>
                          <th>DNI</th>
                          <th>Barrio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultadosSorteo.map((resultado, index) => (
                          <tr
                            key={`resultado-${resultado.sorteoNumero}`}
                            className={index === resultadosSorteo.length - 1 ? 'admin-sorteo-winner-ultimo' : ''}
                          >
                            <td>{resultado.sorteoNumero}</td>
                            <td>{resultado.ganador.apellido}, {resultado.ganador.nombre}</td>
                            <td>{resultado.ganador.dni || '-'}</td>
                            <td>{formatearBarrio(resultado.ganador.barrio_id || resultado.ganador.barrio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="admin-sorteo-lista-toggle">
                <button
                  type="button"
                  className="admin-button secondary"
                  onClick={() => setMostrarParticipantesSorteo((prev) => !prev)}
                >
                  {mostrarParticipantesSorteo ? 'Ocultar' : 'Ver'} lista de niños cargados
                </button>
              </div>

              {mostrarParticipantesSorteo ? (
                participantesConNumero.length === 0 ? (
                  <p className="admin-mini-text">Aun no hay niños cargados para sortear.</p>
                ) : (
                  <ul className="admin-sorteo-list">
                    {participantesConNumero.map((registro) => (
                      <li key={`sorteo-${registro.item.id}`} className="admin-sorteo-item">
                        <span>
                          {registro.item.apellido}, {registro.item.nombre} — DNI {registro.item.dni || '-'}
                          <br />
                          <span className="admin-sorteo-item-barrio">
                            {formatearBarrio(registro.item.barrio_id || registro.item.barrio)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </article>
          ) : null}
        </section>
      </section>

      {modalGanador.visible ? (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-live="assertive">
          <div className="admin-modal-ganador">
            <div className="admin-modal-celebracion" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <span key={`celebracion-${index}`} className="admin-modal-dot" />
              ))}
            </div>
            <h3 className="admin-modal-title">Felicidades {modalGanador.nombre}!</h3>
            <p className="admin-modal-number admin-modal-dni">DNI {modalGanador.dni}</p>
            <p className="admin-modal-barrio">Barrio: {modalGanador.barrio}</p>
            <p className="admin-modal-subtitle">Ganador/a del sorteo N° {modalGanador.sorteoNumero}</p>
            <button
              type="button"
              className="admin-button primary"
              onClick={onContinuarProximoSorteo}
            >
              Realizar el proximo sorteo
            </button>
            <div className="admin-modal-footer">
              <img
                src="/logo.PNG"
                alt="Logo de la comuna"
                className="admin-modal-footer-logo"
              />
              <p className="admin-modal-footer-text">
                Feliz dia del niño! Les desea Chicho Soria
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default Administracion;
