"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

export const UNSAVED_CHANGES_MESSAGE =
  "Tienes cambios sin guardar. Si sales ahora, se perderán. ¿Quieres continuar?";

const activeGuards = new Set<symbol>();
let restoringHistory = false;
let restoreTimeout: number | undefined;
let allowNextNavigation = false;
let allowNavigationTimeout: number | undefined;

function hasUnsavedChanges(): boolean {
  return activeGuards.size > 0;
}

function allowNavigationOnce(): void {
  allowNextNavigation = true;
  window.clearTimeout(allowNavigationTimeout);
  allowNavigationTimeout = window.setTimeout(() => {
    allowNextNavigation = false;
  }, 2000);
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedChanges()) return;
  if (allowNextNavigation) {
    allowNextNavigation = false;
    window.clearTimeout(allowNavigationTimeout);
    return;
  }
  event.preventDefault();
  event.returnValue = "";
}

function handleDocumentClick(event: MouseEvent): void {
  if (!hasUnsavedChanges() || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;

  const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;

  const target = new URL(anchor.href, window.location.href);
  if (
    target.origin === window.location.origin &&
    target.pathname === window.location.pathname &&
    target.search === window.location.search
  ) {
    return;
  }

  if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return;
  }

  allowNavigationOnce();
}

function handlePopState(event: PopStateEvent): void {
  if (restoringHistory) {
    restoringHistory = false;
    window.clearTimeout(restoreTimeout);
    event.stopImmediatePropagation();
    return;
  }
  if (!hasUnsavedChanges()) return;

  if (window.confirm(UNSAVED_CHANGES_MESSAGE)) {
    allowNavigationOnce();
    return;
  }

  // The browser has already moved one entry back when popstate fires. Stop
  // Next.js from processing that route change and return to the current one.
  event.stopImmediatePropagation();
  restoringHistory = true;
  window.clearTimeout(restoreTimeout);
  restoreTimeout = window.setTimeout(() => {
    restoringHistory = false;
  }, 2000);
  window.history.forward();
}

function installNavigationGuards(): void {
  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("popstate", handlePopState, true);
}

function removeNavigationGuards(): void {
  window.removeEventListener("beforeunload", handleBeforeUnload);
  document.removeEventListener("click", handleDocumentClick, true);
  window.removeEventListener("popstate", handlePopState, true);
  restoringHistory = false;
  allowNextNavigation = false;
  window.clearTimeout(restoreTimeout);
  window.clearTimeout(allowNavigationTimeout);
}

function registerUnsavedChangesGuard(): () => void {
  const guardId = Symbol("unsaved-changes");
  const wasEmpty = activeGuards.size === 0;
  activeGuards.add(guardId);
  if (wasEmpty) installNavigationGuards();

  return () => {
    activeGuards.delete(guardId);
    if (activeGuards.size === 0) removeNavigationGuards();
  };
}

export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    return registerUnsavedChangesGuard();
  }, [isDirty]);
}

export function confirmDiscardUnsavedChanges(isDirty: boolean): boolean {
  return !isDirty || window.confirm(UNSAVED_CHANGES_MESSAGE);
}

type FormValues = Record<string, string[]>;

function readFormValues(form: HTMLFormElement | null): FormValues | null {
  if (!form) return null;
  const values: FormValues = {};
  const controls = Array.from(form.elements).filter(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement,
  );

  for (const control of controls) {
    if (
      !control.name ||
      (control instanceof HTMLInputElement &&
        ["button", "submit", "reset", "image"].includes(control.type))
    ) {
      continue;
    }

    let controlValues: string[];
    if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
      controlValues = [`${control.checked ? "checked" : "unchecked"}:${control.value}`];
    } else if (control instanceof HTMLInputElement && control.type === "file") {
      controlValues = Array.from(control.files ?? []).map(
        (file) => `${file.name}:${file.size}:${file.type}:${file.lastModified}`,
      );
    } else if (control instanceof HTMLSelectElement && control.multiple) {
      controlValues = Array.from(control.selectedOptions, (option) => option.value);
    } else {
      controlValues = [control.value];
    }

    (values[control.name] ??= []).push(...controlValues);
  }
  return values;
}

function snapshotsMatch(left: FormValues, right: FormValues): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useFormDirtyState(onDirtyChange?: (dirty: boolean) => void) {
  const formRef = useRef<HTMLFormElement>(null);
  const baselineRef = useRef<FormValues | null>(null);
  const frameRef = useRef<number | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const dirtyRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  onDirtyChangeRef.current = onDirtyChange;

  const setDirty = useCallback((dirty: boolean) => {
    if (dirtyRef.current === dirty) return;
    dirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChangeRef.current?.(dirty);
  }, []);

  const refreshDirty = useCallback(() => {
    const current = readFormValues(formRef.current);
    const baseline = baselineRef.current;
    setDirty(!!current && !!baseline && !snapshotsMatch(current, baseline));
  }, [setDirty]);

  const captureBaseline = useCallback(() => {
    baselineRef.current = readFormValues(formRef.current);
    setDirty(false);
  }, [setDirty]);

  const scheduleRefresh = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      refreshDirty();
    });
  }, [refreshDirty]);

  const onInputCapture = useCallback(() => {
    refreshDirty();
    scheduleRefresh();
  }, [refreshDirty, scheduleRefresh]);

  const onChangeCapture = onInputCapture;

  const onClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLFormElement>) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button:not([type='submit']):not([data-ignore-dirty])")
      ) {
        // Some composite fields update hidden values after their button
        // handler runs (patient pickers and rich-text controls). Mark the
        // form immediately, then compare values after React commits.
        setDirty(true);
      }
      scheduleRefresh();
    },
    [scheduleRefresh, setDirty],
  );

  const rebaseFields = useCallback(
    (names: string[]) => {
      const current = readFormValues(formRef.current);
      if (!current) return;
      const baseline = baselineRef.current ?? { ...current };
      for (const name of names) {
        if (current[name]) baseline[name] = current[name];
        else delete baseline[name];
      }
      baselineRef.current = baseline;
      refreshDirty();
    },
    [refreshDirty],
  );

  useEffect(() => {
    captureBaseline();
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [captureBaseline]);

  return {
    formRef,
    isDirty,
    dirtyRef,
    markDirty: () => setDirty(true),
    scheduleRefresh,
    captureBaseline,
    rebaseFields,
    onInputCapture,
    onChangeCapture,
    onClickCapture,
  };
}
