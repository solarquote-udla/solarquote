/**
 * services/api.ts: mensajeDeError y erroresDeCampo contra lo que entrega
 * el manejador global de 422 del backend (app/core/errores.py) — ya en
 * español y sin el prefijo "Value error, " de Pydantic.
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

  it("no antepone el nombre del campo a un mensaje de validación con loc", () => {
    const error = errorConDetail(422, [{ msg: "El Voc debe ser mayor que el Vmp.", loc: ["body", "voc_v"], type: "value_error" }]);
    expect(mensajeDeError(error)).toBe("El Voc debe ser mayor que el Vmp.");
  });

  it("une varios mensajes de validación con un punto", () => {
    const error = errorConDetail(422, [
      { msg: "Este campo es obligatorio.", loc: ["body", "marca"], type: "missing" },
      { msg: "Debe ser mayor que 0.", loc: ["body", "potencia_kw"], type: "greater_than" },
    ]);
    expect(mensajeDeError(error)).toBe("Este campo es obligatorio.. Debe ser mayor que 0.");
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
