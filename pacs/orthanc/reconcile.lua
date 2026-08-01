-- Orthanc -> RCMS reconciliation bridge.
--
-- On every stored instance we notify the RCMS backend so it can link the study
-- to the scheduled examination (by AccessionNumber / StudyInstanceUID) and
-- advance the RIS workflow. Heavy work happens in the backend; this stays thin.
--
-- Auth: a shared secret is sent in the X-Pacs-Signature header and compared
-- timing-safe on the backend. Orthanc's Lua sandbox has no HMAC primitive, so a
-- high-entropy shared secret over the compose-internal network is the pragmatic
-- equivalent of the guide's HMAC. Rotate PACS_WEBHOOK_SECRET to revoke.

local WEBHOOK_URL = os.getenv('RCMS_WEBHOOK_URL') or 'http://backend:3000/api/pacs/webhook'
local WEBHOOK_SECRET = os.getenv('PACS_WEBHOOK_SECRET') or ''

function OnStoredInstance(instanceId, tags, metadata, origin)
  -- Ignore instances we generated ourselves (e.g. header rewrites during
  -- reconciliation) to avoid webhook loops.
  if origin ~= nil and origin['RequestOrigin'] == 'Lua' then
    return
  end

  -- Resolve the Orthanc parent-study handle so the backend can address the
  -- study for later modify/export operations. Best-effort: a failure here just
  -- leaves OrthancStudyId nil (the RIS side stays keyed on StudyInstanceUID).
  local orthancStudyId = nil
  local okStudy, instInfo = pcall(function()
    return ParseJson(RestApiGet('/instances/' .. instanceId))
  end)
  if okStudy and instInfo ~= nil then
    orthancStudyId = instInfo['ParentStudy']
  end

  local payload = {
    OrthancInstanceId = instanceId,
    OrthancStudyId = orthancStudyId,
    PatientID = tags['PatientID'],
    PatientName = tags['PatientName'],
    AccessionNumber = tags['AccessionNumber'],
    StudyInstanceUID = tags['StudyInstanceUID'],
    SeriesInstanceUID = tags['SeriesInstanceUID'],
    SOPInstanceUID = tags['SOPInstanceUID'],
    SOPClassUID = tags['SOPClassUID'],
    Modality = tags['Modality'],
    SeriesNumber = tags['SeriesNumber'],
    InstanceNumber = tags['InstanceNumber'],
    SeriesDescription = tags['SeriesDescription'],
    StudyDescription = tags['StudyDescription'],
    BodyPartExamined = tags['BodyPartExamined']
  }

  local body = DumpJson(payload, false)
  local headers = {
    ['Content-Type'] = 'application/json',
    ['X-Pacs-Signature'] = WEBHOOK_SECRET
  }

  -- Best-effort: never block or fail the DICOM association on webhook errors.
  local ok, err = pcall(function()
    HttpPost(WEBHOOK_URL, body, headers)
  end)
  if not ok then
    print('RCMS reconcile webhook failed for instance ' .. instanceId .. ': ' .. tostring(err))
  end
end
