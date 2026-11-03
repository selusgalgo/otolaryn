import { startTransition, type FormEvent } from "react";

// React 19 vacía todos los campos no controlados (los de `defaultValue`) de
// un <form action={fn}> en cuanto la acción termina, también cuando falla —
// sesión caducada, DNI duplicado, error de red... — y la persona se
// encuentra el formulario en blanco justo cuando necesitaba corregirlo.
// Enviando desde onSubmit con startTransition la acción se ejecuta igual
// (mismo useActionState, mismo `pending`) pero React no resetea el formulario.
export function keepValuesOnSubmit(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter instanceof HTMLElement ? submitter : undefined);
    startTransition(() => dispatch(formData));
  };
}
