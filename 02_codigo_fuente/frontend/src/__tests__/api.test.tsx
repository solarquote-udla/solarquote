/**
 * services/api.ts: mensajeDeError y erroresDeCampo contra lo que entrega
 * el manejador global de 422 del backend (app/core/errores.py) — ya en
 * español, con el `type` de cada error y sin el prefijo "Value error, "
 * de Pydantic.
 *
 * `mensajeDeError` solo tiene el mensaje general (para las pantallas que
 * todavía no muestran el error junto a cada campo, como Paso 2/3,
 * Clientes y Despacho): un `value_error` (los que escribimos nosotros)
 * ya menciona el campo en el propio texto, pero las restricciones de
 * Pydantic no, así que ahí se antepone el campo usando el `loc`.
 */
import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { erroresDeCampo, mensajeDeError } from "@/services/api";

const errorConDetail = (status: number, detail: unknown) =>
  new AxiosError(String(status), "ERR", undefined, undefined, {
    status, data: { detail }, statusText: "", headers: {}, config: { headers: new AxiosHeaders() },
  });

describe("mensajeDeError", () => {
  it("usa el detail tal cual cuando es un string (error de negocio)", () => {
    expect(mensajeDeError(errorConDetail(409, "Ya existe un panel con esa marca y modelo."))).toBe(
      "Ya existe un panel con esa marca y modelo.",
    );
  });

  it("un value_error (propio) no lleva el campo antepuesto: el texto ya lo menciona", () => {
    const error = errorConDetail(422, [{ msg: "El Voc debe ser mayor que el Vmp.", loc: ["body", "voc_v"], type: "value_error" }]);
    expect(mensajeDeError(error)).toBe("El Voc debe ser mayor que el Vmp.");
  });

  it("una restricción de Pydantic (no value_error) antepone el campo, legible", () => {
    const error = errorConDetail(422, [{ msg: "Debe ser mayor que 0.", loc: ["body", "potencia_wp"], type: "greater_than" }]);
    expect(mensajeDeError(error)).toBe("Potencia Wp: Debe ser mayor que 0.");
  });

  it("un campo anidado antepone la ruta completa, cada nivel legible", () => {
    const error = errorConDetail(422, [{ msg: "Debe ser un número entero.", loc: ["body", "inversores", 0, "strings_por_mppt"], type: "int_type" }]);
    expect(mensajeDeError(error)).toBe("Inversores › 0 › Strings Por Mppt: Debe ser un número entero.");
  });

  it("une varios mensajes de validación con un punto", () => {
    const error = errorConDetail(422, [
      { msg: "Este campo es obligatorio.", loc: ["body", "marca"], type: "missing" },
      { msg: "Debe ser mayor que 0.", loc: ["body", "potencia_kw"], type: "greater_than" },
    ]);
    expect(mensajeDeError(error)).toBe("Marca: Este campo es obligatorio.. Potencia Kw: Debe ser mayor que 0.");
  });

  it("no es un error de axios: devuelve el mensaje por defecto", () => {
    expect(mensajeDeError(new Error("algo"), "No se pudo crear")).toBe("No se pudo crear");
  });
});

describe("erroresDeCampo", () => {
  it("convierte el detail en un error por campo, sin el \"body\" inicial", () => {
    const error = errorConDetail(422, [
      { msg: "Debe ser un número entero mayor que 0.", loc: ["body", "mppts"], type: "greater_than" },
      { msg: "El Voc debe ser mayor que el Vmp.", loc: ["body", "panel", "vmp_v"], type: "value_error" },
    ]);
    expect(erroresDeCampo(error)).toEqual({
      mppts: "Debe ser un número entero mayor que 0.",
      "panel.vmp_v": "El Voc debe ser mayor que el Vmp.",
    });
  });

  it("un error sin campo (loc: [\"body\"]) no entra, porque no hay campo al que asignarlo", () => {
    const error = errorConDetail(422, [{ msg: "Ingresa Vmax y Vmin juntos.", loc: ["body"], type: "value_error" }]);
    expect(erroresDeCampo(error)).toEqual({});
  });

  it("un 409 de negocio (detail string) no entra", () => {
    expect(erroresDeCampo(errorConDetail(409, "Ya existe."))).toEqual({});
  });
});
