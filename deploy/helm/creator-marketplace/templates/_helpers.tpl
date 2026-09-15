{{- define "creator-marketplace.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "creator-marketplace.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "creator-marketplace.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "creator-marketplace.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "creator-marketplace.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "creator-marketplace.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- printf "%s/%s" .Values.image.registry .Values.image.repository -}}:{{- printf "%s-%s" .component $tag -}}
{{- end -}}

{{/*
The database URL, from an existing secret where one is named and from the
chart's own secret otherwise. Failing the render when neither is set is
deliberate: a release that starts without a database only fails later, in a
place where the cause is much harder to see.
*/}}
{{- define "creator-marketplace.databaseEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      {{- if .Values.database.existingSecret }}
      name: {{ .Values.database.existingSecret }}
      key: {{ .Values.database.existingSecretKey }}
      {{- else if .Values.database.url }}
      name: {{ include "creator-marketplace.fullname" . }}-db
      key: DATABASE_URL
      {{- else }}
      {{- fail "Set either database.existingSecret or database.url" }}
      {{- end }}
{{- end -}}

{{- define "creator-marketplace.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "creator-marketplace.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ['ALL']
{{- end -}}
