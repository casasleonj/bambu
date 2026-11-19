// Renderiza el FeedbackField REAL a HTML estático para probarlo en un navegador
// de verdad. Sin Postgres ni Next.js: el componente es 'use client' pero su
// marcado es determinista, así que un render a string sirve para verificar qué
// atributos llegan al DOM y si el navegador bloquea el envío.
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { FeedbackField } from '@/components/feedback-field'

const vacio = () => {}

const formulario = React.createElement(
  'form',
  {
    id: 'cliente-form',
    // Sin onSubmit: queremos ver si el NAVEGADOR bloquea por sí solo.
    action: 'javascript:void(0)',
  },
  React.createElement(FeedbackField, {
    label: 'Nombre',
    required: true,
    value: '',
    onChange: vacio,
    placeholder: 'Ej: Juan',
  }),
  React.createElement(FeedbackField, {
    label: 'Apellido',
    required: true,
    value: '',
    onChange: vacio,
    placeholder: 'Ej: Pérez',
  }),
  React.createElement('button', { type: 'submit', id: 'guardar' }, 'Guardar'),
)

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>#811</title></head>
<body>
${renderToStaticMarkup(formulario)}
<pre id="resultado">pendiente</pre>
</body></html>`

process.stdout.write(html)
