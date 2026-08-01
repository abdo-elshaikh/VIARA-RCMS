import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';

import {
  useCreateExamTypeMutation,
  useCreateMachineMutation,
  useDeleteExamTypeMutation,
  useDeleteMachineMutation,
  useGetExamTypesQuery,
  useGetMachinesQuery,
  useUpdateExamTypeMutation,
  useUpdateMachineMutation,
} from '../../store/api';
import ConfirmDialog from '../ui/ConfirmDialog';
import { getErrorMessage } from '../../utils/getErrorMessage';
import ClinicalFilterPanel from './clinical/ClinicalFilterPanel';
import ClinicalHeader from './clinical/ClinicalHeader';
import ClinicalImportModal from './clinical/ClinicalImportModal';
import { ExamDialog, emptyExam } from './clinical/ExamManagement';
import { MachineDialog, emptyMachine } from './clinical/MachineManagement';
import MachineExplorer from './clinical/MachineExplorer';
import ProcedureList from './clinical/ProcedureList';
import ProcedurePreviewModal from './clinical/ProcedurePreviewModal';
import { CatalogState } from './clinical/SharedComponents';
import {
  buildExamForm,
  buildMachineForm,
  downloadBlob,
  makeCsvFile,
  toExamPayload,
  toMachinePayload,
} from './clinical/clinicalCatalogUtils';

const machineIdOf = (machine) => machine?.modality_id || machine?.id;
const examIdOf = (exam) => exam?.type_id || exam?.id;
const idKey = (value) => String(value ?? '');
const sameId = (left, right) => idKey(left) === idKey(right);
const includesId = (ids, id) => ids.some((item) => sameId(item, id));
const isActiveExam = (exam) => exam?.active ?? exam?.is_active !== false;
const isNotFoundError = (error) => {
  if (error?.status === 404) return true;
  const message = String(error?.data?.message || error?.data?.error || error?.message || '').toLowerCase();
  return message.includes('not found');
};

const normalizeMachine = (machine) => ({
  ...machine,
  id: machineIdOf(machine),
  machineType: machine.type || machine.machineType || 'Other',
  roomNumber: machine.room_number || machine.roomNumber || '',
  serialNumber: machine.serial_number || machine.serialNumber || '',
});

const normalizeExam = (exam) => ({
  ...exam,
  id: examIdOf(exam),
  modality: exam.modality_type || exam.modality || '',
  machineType: exam.modality_type || exam.machineType || '',
  machineName: exam.modality_name || exam.machineName || '',
  anatomy: exam.body_part || exam.bodyPart || '',
  durationMinutes: exam.duration_minutes || exam.durationMinutes || 0,
  requiresContrast: Boolean(exam.contrast_required ?? exam.contrastRequired),
  active: isActiveExam(exam),
  preparationInstructions: exam.preparation_instructions || exam.preparationInstructions || '',
  clinicalNotes: exam.clinical_notes || exam.clinicalNotes || '',
});

const ClinicalOperationsSettings = () => {
  const { t, i18n } = useTranslation('settings');

  const [selectedMachineId, setSelectedMachineId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [machineStatusFilter, setMachineStatusFilter] = useState('All');
  const [selectedAnatomy, setSelectedAnatomy] = useState('all');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [contrastFilter, setContrastFilter] = useState('All');
  const [sortBy, setSortBy] = useState('name-asc');
  const [selectedExamIds, setSelectedExamIds] = useState([]);
  const [localMachines, setLocalMachines] = useState([]);
  const [machineOverridesById, setMachineOverridesById] = useState({});
  const [deletedMachineIds, setDeletedMachineIds] = useState([]);
  const [localExams, setLocalExams] = useState([]);
  const [deletedExamIds, setDeletedExamIds] = useState([]);
  const [examOverridesById, setExamOverridesById] = useState({});

  const [machineEditor, setMachineEditor] = useState(null);
  const [examEditor, setExamEditor] = useState(null);
  const [procedurePreview, setProcedurePreview] = useState(null);
  const [importModalTarget, setImportModalTarget] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [machineForm, setMachineForm] = useState(() => ({ ...emptyMachine }));
  const [examForm, setExamForm] = useState(() => ({ ...emptyExam }));

  const { data: machines = [], isLoading: machinesLoading, isError: machinesError, refetch: refetchMachines } = useGetMachinesQuery();
  const { data: exams = [], isLoading: examsLoading, isError: examsError, refetch: refetchExams } = useGetExamTypesQuery({ includeInactive: true });

  const [createMachine, { isLoading: creatingMachine }] = useCreateMachineMutation();
  const [updateMachine, { isLoading: updatingMachine }] = useUpdateMachineMutation();
  const [deleteMachine, { isLoading: deletingMachine }] = useDeleteMachineMutation();
  const [createExam, { isLoading: creatingExam }] = useCreateExamTypeMutation();
  const [updateExam, { isLoading: updatingExam }] = useUpdateExamTypeMutation();
  const [deleteExam, { isLoading: deletingExam }] = useDeleteExamTypeMutation();

  const busy = creatingMachine || updatingMachine || deletingMachine || creatingExam || updatingExam || deletingExam;
  const normalizedQuery = query.trim().toLocaleLowerCase(i18n.resolvedLanguage || 'en');

  const normalizedMachines = useMemo(() => {
    const merged = [...machines];
    localMachines.forEach((localMachine) => {
      if (!merged.some((machine) => sameId(machineIdOf(machine), machineIdOf(localMachine)))) {
        merged.push(localMachine);
      }
    });

    return merged
      .map((machine) => ({ ...machine, ...(machineOverridesById[idKey(machineIdOf(machine))] || {}) }))
      .map(normalizeMachine)
      .filter((machine) => !includesId(deletedMachineIds, machine.id));
  }, [machines, localMachines, machineOverridesById, deletedMachineIds]);
  const normalizedExams = useMemo(() => {
    const merged = [...exams];
    localExams.forEach((localExam) => {
      if (!merged.some((exam) => sameId(examIdOf(exam), examIdOf(localExam)))) {
        merged.push(localExam);
      }
    });

    return merged
      .map((exam) => ({ ...exam, ...(examOverridesById[idKey(examIdOf(exam))] || {}) }))
      .map(normalizeExam)
      .filter((exam) => !includesId(deletedExamIds, exam.id));
  }, [exams, localExams, deletedExamIds, examOverridesById]);

  const machinesByCategory = useMemo(() => {
    return normalizedMachines.reduce((groups, machine) => {
      const category = machine.machineType || 'Other';
      return {
        ...groups,
        [category]: [...(groups[category] || []), machine],
      };
    }, {});
  }, [normalizedMachines]);

  const categoriesList = useMemo(() => Object.keys(machinesByCategory).sort(), [machinesByCategory]);

  const examCountsByMachine = useMemo(() => {
    return normalizedExams.reduce((counts, exam) => {
      const modalityId = exam.modality_id || exam.modalityId;
      if (!modalityId) return counts;
      return { ...counts, [idKey(modalityId)]: (counts[idKey(modalityId)] || 0) + 1 };
    }, {});
  }, [normalizedExams]);

  const visibleMachines = useMemo(() => {
    return normalizedMachines.filter((machine) => {
      const machineStatus = machine.status || 'Active';
      if (selectedCategory !== 'all' && machine.machineType !== selectedCategory) return false;
      if (machineStatusFilter === 'Attention' && machineStatus === 'Active') return false;
      if (!['All', 'Attention'].includes(machineStatusFilter) && machineStatus !== machineStatusFilter) return false;
      if (!normalizedQuery) return true;

      return [
        machine.name,
        machine.machineType,
        machine.room_number,
        machine.roomNumber,
        machine.location,
        machine.manufacturer,
        machine.model,
      ].some((value) => String(value || '').toLocaleLowerCase(i18n.resolvedLanguage || 'en').includes(normalizedQuery));
    });
  }, [normalizedMachines, selectedCategory, machineStatusFilter, normalizedQuery, i18n.resolvedLanguage]);

  const selectedMachine = useMemo(() => {
    if (selectedMachineId === 'all') return null;
    return normalizedMachines.find((machine) => sameId(machine.id, selectedMachineId)) || null;
  }, [normalizedMachines, selectedMachineId]);

  const anatomiesList = useMemo(() => {
    const parts = new Set();
    normalizedExams.forEach((exam) => {
      const primary = String(exam.anatomy || '').split('/')[0].trim();
      if (primary) parts.add(primary);
    });
    return Array.from(parts).sort();
  }, [normalizedExams]);

  const visibleExams = useMemo(() => {
    return normalizedExams
      .filter((exam) => {
        if (selectedMachineId !== 'all' && !sameId(exam.modality_id, selectedMachineId)) return false;
        if (selectedCategory !== 'all' && exam.machineType !== selectedCategory) return false;
        if (selectedAnatomy !== 'all' && !String(exam.anatomy).toLowerCase().includes(selectedAnatomy.toLowerCase())) return false;

        if (normalizedQuery) {
          const matches = [exam.name, exam.code, exam.anatomy, exam.machineName, exam.machineType]
            .some((value) => String(value || '').toLocaleLowerCase(i18n.resolvedLanguage || 'en').includes(normalizedQuery));
          if (!matches) return false;
        }

        if (statusFilter === 'Active' && !exam.active) return false;
        if (statusFilter === 'Inactive' && exam.active) return false;
        if (contrastFilter === 'contrast' && !exam.requiresContrast) return false;
        if (contrastFilter === 'no-contrast' && exam.requiresContrast) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name-desc') return String(b.name || '').localeCompare(String(a.name || ''));
        if (sortBy === 'duration-asc') return Number(a.durationMinutes || 0) - Number(b.durationMinutes || 0);
        if (sortBy === 'duration-desc') return Number(b.durationMinutes || 0) - Number(a.durationMinutes || 0);
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [
    normalizedExams,
    selectedMachineId,
    selectedCategory,
    selectedAnatomy,
    normalizedQuery,
    i18n.resolvedLanguage,
    statusFilter,
    contrastFilter,
    sortBy,
  ]);

  const visibleExamIds = useMemo(() => visibleExams.map((exam) => exam.id), [visibleExams]);
  const selectedVisibleExamIds = useMemo(() => visibleExamIds.filter((id) => includesId(selectedExamIds, id)), [selectedExamIds, visibleExamIds]);
  const allVisibleExamsSelected = visibleExamIds.length > 0 && selectedVisibleExamIds.length === visibleExamIds.length;
  const someVisibleExamsSelected = selectedVisibleExamIds.length > 0 && !allVisibleExamsSelected;

  const metrics = useMemo(() => ({
    machines: normalizedMachines.length,
    activeMachines: normalizedMachines.filter((machine) => (machine.status || 'Active') === 'Active').length,
    exams: normalizedExams.length,
    activeExams: normalizedExams.filter((exam) => exam.active).length,
    contrastExams: normalizedExams.filter((exam) => exam.requiresContrast).length,
    avgDuration: normalizedExams.length
      ? Math.round(normalizedExams.reduce((sum, exam) => sum + Number(exam.durationMinutes || 0), 0) / normalizedExams.length)
      : 0,
  }), [normalizedMachines, normalizedExams]);

  const maintenanceMachines = useMemo(
    () => normalizedMachines.filter((machine) => (machine.status || 'Active') !== 'Active'),
    [normalizedMachines]
  );

  const resetFilters = () => {
    setSelectedMachineId('all');
    setSelectedCategory('all');
    setMachineStatusFilter('All');
    setSelectedAnatomy('all');
    setStatusFilter('All');
    setContrastFilter('All');
    setSortBy('name-asc');
    setQuery('');
    setSelectedExamIds([]);
  };

  const openMachine = (machine) => {
    setMachineEditor(machine || 'new');
    setMachineForm(machine ? buildMachineForm(machine) : { ...emptyMachine });
  };

  const applyMachineOverride = (machineId, savedMachine, payload) => {
    setMachineOverridesById((prev) => ({
      ...prev,
      [idKey(machineId)]: {
        ...savedMachine,
        name: payload.name !== undefined ? payload.name : savedMachine?.name,
        type: payload.type !== undefined ? payload.type : savedMachine?.type,
        room_number: payload.roomNumber !== undefined ? payload.roomNumber : savedMachine?.room_number,
        serial_number: payload.serialNumber !== undefined ? payload.serialNumber : savedMachine?.serial_number,
        manufacturer: payload.manufacturer !== undefined ? payload.manufacturer : savedMachine?.manufacturer,
        model: payload.model !== undefined ? payload.model : savedMachine?.model,
        installation_date: payload.installationDate !== undefined ? payload.installationDate : savedMachine?.installation_date,
        location: payload.location !== undefined ? payload.location : savedMachine?.location,
        status: payload.status !== undefined ? payload.status : savedMachine?.status,
      },
    }));
  };

  const removeMachineLocally = (id) => {
    setDeletedMachineIds((prev) => (includesId(prev, id) ? prev : [...prev, id]));
    setLocalMachines((prev) => prev.filter((machine) => !sameId(machineIdOf(machine), id)));
    setMachineOverridesById((prev) => {
      const next = { ...prev };
      delete next[idKey(id)];
      return next;
    });
    setSelectedMachineId((current) => (sameId(current, id) ? 'all' : current));
  };

  const removeExamLocally = (id) => {
    setDeletedExamIds((prev) => (includesId(prev, id) ? prev : [...prev, id]));
    setLocalExams((prev) => prev.filter((exam) => !sameId(examIdOf(exam), id)));
    setExamOverridesById((prev) => {
      const next = { ...prev };
      delete next[idKey(id)];
      return next;
    });
    setSelectedExamIds((prev) => prev.filter((selectedId) => !sameId(selectedId, id)));
  };

  const removeExamsByMachineLocally = (machineId) => {
    const linkedExamIds = normalizedExams
      .filter((exam) => sameId(exam.modality_id || exam.modalityId, machineId))
      .map((exam) => exam.id);

    if (linkedExamIds.length === 0) return;
    setDeletedExamIds((prev) => {
      const next = new Set(prev.map(idKey));
      linkedExamIds.forEach((id) => next.add(idKey(id)));
      return Array.from(next);
    });
    setLocalExams((prev) => prev.filter((exam) => !linkedExamIds.some((id) => sameId(examIdOf(exam), id))));
    setExamOverridesById((prev) => {
      const next = { ...prev };
      linkedExamIds.forEach((id) => {
        delete next[idKey(id)];
      });
      return next;
    });
    setSelectedExamIds((prev) => prev.filter((id) => !linkedExamIds.some((linkedId) => sameId(linkedId, id))));
  };

  const openExam = (exam, presetModalityId) => {
    const defaultModalityId = presetModalityId
      || (selectedMachineId !== 'all' ? selectedMachineId : normalizedMachines.find((machine) => machine.status === 'Active')?.id || normalizedMachines[0]?.id || '');

    setExamEditor(exam || 'new');
    setExamForm(exam ? buildExamForm(exam) : buildExamForm(null, { ...emptyExam, modalityId: defaultModalityId }));
  };

  const applyExamOverride = (examId, savedExam, payload) => {
    const assignedMachine = normalizedMachines.find((machine) => sameId(machine.id, payload.modalityId || savedExam?.modality_id));

    setExamOverridesById((prev) => ({
      ...prev,
      [idKey(examId)]: {
        ...savedExam,
        modality_id: payload.modalityId || savedExam?.modality_id,
        modality_name: assignedMachine?.name || savedExam?.modality_name,
        modality_type: assignedMachine?.machineType || savedExam?.modality_type,
        code: payload.code !== undefined ? payload.code : savedExam?.code,
        name: payload.name !== undefined ? payload.name : savedExam?.name,
        price: payload.price !== undefined ? payload.price : savedExam?.price,
        duration_minutes: payload.durationMinutes !== undefined ? payload.durationMinutes : savedExam?.duration_minutes,
        body_part: payload.bodyPart !== undefined ? payload.bodyPart : savedExam?.body_part,
        preparation_instructions: payload.preparationInstructions !== undefined ? payload.preparationInstructions : savedExam?.preparation_instructions,
        contrast_required: payload.contrastRequired !== undefined ? payload.contrastRequired : savedExam?.contrast_required,
        is_active: payload.isActive !== undefined ? payload.isActive : savedExam?.is_active,
      },
    }));
  };

  const findExamByPayload = (records, payload) => {
    const payloadName = String(payload.name || '').trim().toLocaleLowerCase(i18n.resolvedLanguage || 'en');
    const payloadCode = String(payload.code || '').trim().toLocaleUpperCase(i18n.resolvedLanguage || 'en');
    return records.find((exam) => {
      const sameMachine = !payload.modalityId || sameId(exam.modality_id || exam.modalityId, payload.modalityId);
      const sameName = payloadName && String(exam.name || '').trim().toLocaleLowerCase(i18n.resolvedLanguage || 'en') === payloadName;
      const sameCode = !payloadCode || String(exam.code || '').trim().toLocaleUpperCase(i18n.resolvedLanguage || 'en') === payloadCode;
      return sameMachine && sameName && sameCode;
    });
  };

  const refetchExamCatalog = async (confirmedExamId) => {
    const refreshed = await refetchExams();
    const refreshedExams = refreshed?.data || [];
    if (confirmedExamId && refreshedExams.some((exam) => sameId(examIdOf(exam), confirmedExamId))) {
      setLocalExams((prev) => prev.filter((exam) => !sameId(examIdOf(exam), confirmedExamId)));
      setDeletedExamIds((prev) => prev.filter((id) => !sameId(id, confirmedExamId)));
    }
    return refreshedExams;
  };

  const saveMachine = async (event) => {
    event.preventDefault();
    try {
      const payload = toMachinePayload(machineForm, { mode: machineEditor === 'new' ? 'create' : 'update' });
      if (machineEditor === 'new') {
        const savedMachine = await createMachine(payload).unwrap();
        const savedMachineId = machineIdOf(savedMachine);
        setLocalMachines((prev) => [savedMachine, ...prev.filter((machine) => !sameId(machineIdOf(machine), savedMachineId))]);
        setDeletedMachineIds((prev) => prev.filter((id) => !sameId(id, savedMachineId)));
        setSelectedMachineId(savedMachineId || 'all');
        setSelectedCategory(payload.type || 'all');
        setMachineStatusFilter('All');
        toast.success(t('settings.clinical.messages.machineCreated', { defaultValue: 'Machine registered successfully' }));
      } else {
        const machineId = machineIdOf(machineEditor);
        const savedMachine = await updateMachine({ id: machineId, ...payload }).unwrap();
        applyMachineOverride(machineId, savedMachine, payload);
        setSelectedMachineId(machineId);
        if (payload.type) setSelectedCategory(payload.type);
        setMachineStatusFilter('All');
        toast.success(t('settings.clinical.messages.machineUpdated', { defaultValue: 'Machine configuration updated' }));
      }
      await Promise.all([refetchMachines(), refetchExams()]);
      setMachineEditor(null);
    } catch (error) {
      toast.error(getErrorMessage(error, t('settings.clinical.messages.saveFailed', { defaultValue: 'Failed to save changes' })));
    }
  };

  const saveExam = async (event) => {
    event.preventDefault();
    try {
      const payload = toExamPayload(examForm, { mode: examEditor === 'new' ? 'create' : 'update' });
      let confirmedExamId = null;
      if (examEditor === 'new') {
        const savedExam = await createExam(payload).unwrap();
        const savedExamId = examIdOf(savedExam);
        confirmedExamId = savedExamId;
        setLocalExams((prev) => [savedExam, ...prev.filter((exam) => !sameId(examIdOf(exam), savedExamId))]);
        setDeletedExamIds((prev) => prev.filter((id) => !sameId(id, savedExamId)));
        applyExamOverride(savedExamId, savedExam, payload);
        toast.success(t('settings.clinical.messages.examCreated', { defaultValue: 'Examination type created successfully' }));
      } else {
        const examId = examIdOf(examEditor);
        let savedExam;
        try {
          savedExam = await updateExam({ id: examId, ...payload }).unwrap();
        } catch (error) {
          if (!isNotFoundError(error)) throw error;
          const refreshedExams = await refetchExamCatalog();
          const refreshedExam = refreshedExams.find((exam) => sameId(examIdOf(exam), examId)) || findExamByPayload(refreshedExams, payload);
          const refreshedExamId = examIdOf(refreshedExam);
          if (!refreshedExamId || sameId(refreshedExamId, examId)) throw error;
          savedExam = await updateExam({ id: refreshedExamId, ...payload }).unwrap();
        }
        confirmedExamId = examIdOf(savedExam) || examId;
        applyExamOverride(confirmedExamId, savedExam, payload);
        toast.success(t('settings.clinical.messages.examUpdated', { defaultValue: 'Examination type updated' }));
      }
      await refetchExamCatalog(confirmedExamId);
      setExamEditor(null);
    } catch (error) {
      toast.error(getErrorMessage(error, t('settings.clinical.messages.saveFailed', { defaultValue: 'Failed to save changes' })));
    }
  };

  const handleMachineStatusChange = async (machine, newStatus) => {
    try {
      await updateMachine({
        id: machineIdOf(machine),
        ...toMachinePayload(buildMachineForm(machine, { status: newStatus }), { mode: 'update' }),
        status: newStatus,
      }).unwrap();
      applyMachineOverride(machineIdOf(machine), machine, { status: newStatus });
      await Promise.all([refetchMachines(), refetchExams()]);
      toast.success(t('settings.clinical.messages.machineStatusUpdated', { defaultValue: 'Machine status updated.' }));
    } catch (error) {
      toast.error(getErrorMessage(error, t('settings.clinical.messages.machineStatusFailed', { defaultValue: 'Failed to update machine status' })));
    }
  };

  const handleToggleExamActive = async (exam) => {
    try {
      const examId = examIdOf(exam);
      const payload = { isActive: !isActiveExam(exam) };
      const savedExam = await updateExam({ id: examId, ...payload }).unwrap();
      applyExamOverride(examId, savedExam, payload);
      await refetchExams();
      toast.success(t('settings.clinical.messages.examStatusUpdated', { defaultValue: 'Procedure status updated.' }));
    } catch (error) {
      toast.error(getErrorMessage(error, t('settings.clinical.messages.examStatusFailed', { defaultValue: 'Failed to update procedure status' })));
    }
  };

  const requestDeleteMachine = (id) => {
    const machine = normalizedMachines.find((item) => sameId(item.id, id));
    setConfirmAction({
      type: 'deleteMachine',
      id,
      title: t('settings.clinical.machines.deleteTitle', { defaultValue: 'Delete machine?' }),
      message: t('settings.clinical.machines.confirmDelete', {
        defaultValue: `Delete machine "${machine?.name || id}"? Its procedures will also be removed from the active catalog.`,
        name: machine?.name || id,
      }),
      confirmLabel: t('settings.clinical.machines.deleteAction', { defaultValue: 'Delete machine' }),
      variant: 'danger',
    });
  };

  const executeDeleteMachine = async (id) => {
    try {
      await deleteMachine(id).unwrap();
      removeMachineLocally(id);
      removeExamsByMachineLocally(id);
      await Promise.all([refetchMachines(), refetchExams()]);
      toast.success(t('settings.clinical.machines.deleteSuccess', { defaultValue: 'Machine deleted successfully' }));
      return true;
    } catch (error) {
      const message = getErrorMessage(error, '');
      if (error?.status === 404 || /machine not found/i.test(message)) {
        removeMachineLocally(id);
        removeExamsByMachineLocally(id);
        await Promise.all([refetchMachines(), refetchExams()]);
        toast.success(t('settings.clinical.machines.alreadyRemoved', { defaultValue: 'Machine was already removed. The list has been refreshed.' }));
        return true;
      }
      toast.error(getErrorMessage(error, t('settings.clinical.machines.deleteError', { defaultValue: 'Failed to delete machine' })));
      return false;
    }
  };

  const requestDeleteExam = (id) => {
    const exam = normalizedExams.find((item) => sameId(item.id, id));
    setConfirmAction({
      type: 'deleteExam',
      id,
      title: t('settings.clinical.exams.deleteTitle', { defaultValue: 'Delete procedure?' }),
      message: t('settings.clinical.exams.confirmDelete', {
        defaultValue: `Delete procedure "${exam?.name || id}" from the active clinical catalog?`,
        name: exam?.name || id,
      }),
      confirmLabel: t('settings.clinical.exams.deleteAction', { defaultValue: 'Delete procedure' }),
      variant: 'danger',
    });
  };

  const executeDeleteExam = async (id) => {
    try {
      await deleteExam(id).unwrap();
      removeExamLocally(id);
      await refetchExams();
      toast.success(t('settings.clinical.exams.deleteSuccess', { defaultValue: 'Procedure deleted successfully' }));
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, t('settings.clinical.exams.deleteError', { defaultValue: 'Failed to delete procedure' })));
      return false;
    }
  };

  const handleToggleExamSelection = (id, checked) => {
    setSelectedExamIds((prev) => {
      if (checked) return includesId(prev, id) ? prev : [...prev, id];
      return prev.filter((selectedId) => !sameId(selectedId, id));
    });
  };

  const handleToggleVisibleExamSelection = (checked) => {
    setSelectedExamIds((prev) => {
      if (!checked) return prev.filter((id) => !includesId(visibleExamIds, id));
      const next = new Map(prev.map((id) => [idKey(id), id]));
      visibleExamIds.forEach((id) => next.set(idKey(id), id));
      return Array.from(next.values());
    });
  };

  const handleBulkToggleActive = async (activate) => {
    if (selectedExamIds.length === 0) return;

    try {
      const updatedExams = await Promise.all(selectedExamIds.map((id) => updateExam({ id, isActive: activate }).unwrap()));
      updatedExams.forEach((savedExam, index) => {
        applyExamOverride(selectedExamIds[index], savedExam, { isActive: activate });
      });
      toast.success(t('settings.clinical.messages.bulkStatusUpdated', { defaultValue: 'Selected procedures updated.' }));
      setSelectedExamIds([]);
      await refetchExams();
    } catch (error) {
      toast.error(getErrorMessage(error, t('settings.clinical.messages.bulkStatusFailed', { defaultValue: 'Failed to update selected procedures' })));
    }
  };

  const requestBulkDeleteExams = () => {
    if (selectedExamIds.length === 0) return;

    const ids = [...selectedExamIds];
    setConfirmAction({
      type: 'bulkDeleteExams',
      ids,
      title: t('settings.clinical.bulkDeleteTitle', { defaultValue: 'Delete selected procedures?' }),
      message: t('settings.clinical.confirmBulkDelete', {
        defaultValue: 'Delete {{count}} selected procedure(s) from the active clinical catalog?',
        count: ids.length,
      }),
      confirmLabel: t('settings.clinical.bulkDelete', { defaultValue: 'Delete' }),
      variant: 'danger',
    });
  };

  const executeBulkDeleteExams = async (ids) => {
    if (!ids?.length) return true;

    const deletedIds = [];
    const failed = [];

    for (const id of ids) {
      try {
        await deleteExam(id).unwrap();
        deletedIds.push(id);
      } catch (error) {
        const exam = normalizedExams.find((item) => sameId(item.id, id));
        failed.push({ name: exam?.name || id, message: getErrorMessage(error, 'Delete failed') });
      }
    }

    deletedIds.forEach(removeExamLocally);
    await refetchExams();

    if (deletedIds.length > 0) {
      toast.success(t('settings.clinical.messages.bulkDeleteSuccess', { defaultValue: 'Selected procedures deleted.', count: deletedIds.length }));
    }
    if (failed.length > 0) {
      toast.error(`${t('settings.clinical.messages.bulkDeleteFailed', { defaultValue: 'Some selected procedures could not be deleted.', count: failed.length })} ${failed[0].name}: ${failed[0].message}`);
    }
    return failed.length === 0;
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return true;

    if (confirmAction.type === 'deleteMachine') {
      return executeDeleteMachine(confirmAction.id);
    }
    if (confirmAction.type === 'deleteExam') {
      return executeDeleteExam(confirmAction.id);
    }
    if (confirmAction.type === 'bulkDeleteExams') {
      return executeBulkDeleteExams(confirmAction.ids);
    }
    return true;
  };

  const handleExportData = (type) => {
    if (type === 'machines') {
      const header = ['Machine Name', 'Modality Class', 'Room Number', 'Serial Number', 'Manufacturer', 'Model', 'Facility Location', 'Status', 'Installation Date'];
      const rows = visibleMachines.map((machine) => [
        machine.name,
        machine.machineType,
        machine.room_number || machine.roomNumber || '',
        machine.serial_number || machine.serialNumber || '',
        machine.manufacturer || '',
        machine.model || '',
        machine.location || '',
        machine.status || 'Active',
        machine.installation_date ? machine.installation_date.slice(0, 10) : '',
      ]);
      downloadBlob(makeCsvFile(header, rows), `rcms_modality_machines_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(t('settings.clinical.messages.machinesExported', { defaultValue: 'Machines exported.', count: visibleMachines.length }));
      return;
    }

    const header = ['Procedure Code', 'Procedure Name', 'Modality Machine', 'Price', 'Duration Minutes', 'Body Part', 'Contrast Required', 'Status', 'Preparation Instructions'];
    const rows = visibleExams.map((exam) => [
      exam.code || '',
      exam.name,
      exam.machineName || '',
      Number(exam.price || 0).toFixed(2),
      exam.durationMinutes || 30,
      exam.anatomy || '',
      exam.requiresContrast ? 'Yes' : 'No',
      exam.active ? 'Active' : 'Inactive',
      exam.preparationInstructions || '',
    ]);
    downloadBlob(makeCsvFile(header, rows), `rcms_procedure_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('settings.clinical.messages.examsExported', { defaultValue: 'Procedures exported.', count: visibleExams.length }));
  };

  const closeImportModal = async () => {
    setImportModalTarget(null);
    await Promise.all([refetchMachines(), refetchExams()]);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <ClinicalHeader
        t={t}
        metrics={metrics}
        maintenanceMachines={maintenanceMachines}
        onFilterMaintenance={() => {
          setSelectedMachineId('all');
          setSelectedCategory('all');
          setMachineStatusFilter('Attention');
        }}
        onExport={() => handleExportData(selectedMachineId === 'all' ? 'machines' : 'exams')}
        onImport={() => setImportModalTarget(selectedMachineId === 'all' ? 'machines' : 'exams')}
        onAddMachine={() => openMachine()}
        onAddExam={() => openExam(null, selectedMachineId !== 'all' ? selectedMachineId : undefined)}
      />

      <MachineExplorer
        t={t}
        machines={normalizedMachines}
        visibleMachines={visibleMachines}
        categoriesList={categoriesList}
        selectedCategory={selectedCategory}
        machineStatusFilter={machineStatusFilter}
        selectedMachineId={selectedMachineId}
        examCountsByMachine={examCountsByMachine}
        machinesByCategory={machinesByCategory}
        onCategoryChange={(category) => {
          setSelectedCategory(category);
          setSelectedExamIds([]);
        }}
        onMachineStatusFilterChange={(status) => {
          setMachineStatusFilter(status);
          setSelectedMachineId('all');
          setSelectedExamIds([]);
        }}
        onSelectMachine={(id) => {
          setSelectedMachineId(id);
          setSelectedExamIds([]);
        }}
        onStatusChange={handleMachineStatusChange}
        onEditMachine={openMachine}
        onDeleteMachine={requestDeleteMachine}
        onAddMachine={() => openMachine()}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4 lg:p-6">
        <div className="mb-4 flex flex-col gap-4 border-b border-slate-100 pb-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
              {selectedMachine ? selectedMachine.machineType : t('settings.clinical.allMachines', 'All machines')}
            </p>
            <h3 className="mt-1 truncate text-lg font-bold tracking-tight text-slate-950 dark:text-white sm:text-xl">
              {selectedMachine?.name || t('settings.clinical.procedureCatalog', 'Procedure catalog')}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {t('settings.clinical.procedureSummary', '{{visible}} visible of {{total}} procedures. {{contrast}} require contrast. Average duration {{duration}} min.', {
                visible: visibleExams.length,
                total: normalizedExams.length,
                contrast: metrics.contrastExams,
                duration: metrics.avgDuration,
              })}
            </p>
            {selectedMachine ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {selectedMachine.status || t('settings.clinical.statuses.Active', 'Active')}
                </span>
                {selectedMachine.roomNumber ? (
                  <span className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                    {t('settings.clinical.machines.room', 'Room')} {selectedMachine.roomNumber}
                  </span>
                ) : null}
                {selectedMachine.location ? (
                  <span className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/60">{selectedMachine.location}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => openExam(null, selectedMachineId !== 'all' ? selectedMachineId : undefined)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 active:scale-[0.98]"
          >
            <Plus size={16} strokeWidth={2.25} />
            {t('settings.clinical.addProcedure', 'Add procedure')}
          </button>
        </div>

        <ClinicalFilterPanel
          t={t}
          query={query}
          selectedAnatomy={selectedAnatomy}
          statusFilter={statusFilter}
          contrastFilter={contrastFilter}
          sortBy={sortBy}
          anatomiesList={anatomiesList}
          onQueryChange={(value) => {
            setQuery(value);
            setSelectedExamIds([]);
          }}
          onAnatomyChange={(value) => {
            setSelectedAnatomy(value);
            setSelectedExamIds([]);
          }}
          onStatusFilterChange={(value) => {
            setStatusFilter(value);
            setSelectedExamIds([]);
          }}
          onContrastFilterChange={(value) => {
            setContrastFilter(value);
            setSelectedExamIds([]);
          }}
          onSortByChange={setSortBy}
          onClear={resetFilters}
        />

        <div className="mt-5">
          <CatalogState
            loading={examsLoading || machinesLoading}
            error={examsError || machinesError}
            empty={visibleExams.length === 0}
            retry={() => Promise.all([refetchMachines(), refetchExams()])}
            t={t}
          >
            <ProcedureList
              t={t}
              exams={visibleExams}
              selectedExamIds={selectedExamIds}
              allVisibleExamsSelected={allVisibleExamsSelected}
              someVisibleExamsSelected={someVisibleExamsSelected}
              onToggleVisibleSelection={handleToggleVisibleExamSelection}
              onToggleExamSelection={handleToggleExamSelection}
              onBulkActiveChange={handleBulkToggleActive}
              onBulkDelete={requestBulkDeleteExams}
              onToggleActive={handleToggleExamActive}
              onEditExam={openExam}
              onDeleteExam={requestDeleteExam}
              onPreviewExam={setProcedurePreview}
            />
          </CatalogState>
        </div>
      </section>

      <MachineDialog
        open={Boolean(machineEditor)}
        editing={machineEditor !== 'new'}
        form={machineForm}
        setForm={setMachineForm}
        onClose={() => !busy && setMachineEditor(null)}
        onSave={saveMachine}
        busy={busy}
        t={t}
      />

      <ExamDialog
        open={Boolean(examEditor)}
        editing={examEditor !== 'new'}
        form={examForm}
        setForm={setExamForm}
        machines={normalizedMachines}
        onClose={() => !busy && setExamEditor(null)}
        onSave={saveExam}
        busy={busy}
        t={t}
      />

      <ProcedurePreviewModal exam={procedurePreview} t={t} onClose={() => setProcedurePreview(null)} />

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        onClose={() => !busy && setConfirmAction(null)}
        onConfirm={executeConfirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        cancelLabel={t('settings.clinical.cancel', { defaultValue: 'Cancel' })}
        variant={confirmAction?.variant || 'danger'}
        isLoading={busy}
      />

      <ClinicalImportModal
        isOpen={Boolean(importModalTarget)}
        onClose={closeImportModal}
        targetType={importModalTarget || 'exams'}
        machines={normalizedMachines}
        exams={normalizedExams}
        onImportMachines={async (data) => createMachine(data).unwrap()}
        onUpdateMachine={async (id, data) => updateMachine({ id, ...data }).unwrap()}
        onImportExams={async (data) => createExam(data).unwrap()}
        onUpdateExam={async (id, data) => updateExam({ id, ...data }).unwrap()}
        isImporting={creatingMachine || updatingMachine || creatingExam || updatingExam}
      />
    </div>
  );
};

export default ClinicalOperationsSettings;
