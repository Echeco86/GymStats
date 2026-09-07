# ============================================================
# actualizar_ML_Dashboard.R
#
# Actualiza la hoja "ML_Dashboard" del Google Sheet del pedido
# "ESTRATEGIAS DE FINANCIAMIENTO DE LOS HOGARES" con indicadores
# calculados a partir de las bases trimestrales de la Encuesta de
# Bienestar (GCBA).
#
# Carpeta de destino prevista (Windows, uso local del usuario):
#   C:/Users/DELL/Documents/TRABAJO/DCPE/ENCUESTA_DE_BIENESTAR/PEDIDOS/
#     ESTRATEGIAS DE FINANCIAMIENTO DE LOS HOGARES/actualizar_ML_Dashboard.R
#
# Supuestos a revisar contra los encabezados reales de la hoja
# "ML_Dashboard" (fila 1), ya que este script no tuvo acceso al
# Sheet ni a las bases .sav para validarlos:
#   - Bloque A (fila 2 en adelante):  bloque | anio | trimestre | t_actividad | t_empleo | t_desempleo
#   - Bloque B (fila 41 en adelante): bloque | anio | trimestre | sexo | t_actividad | t_empleo | t_desempleo | ingreso_medio | informalidad
#   - Bloque C (fila 56 en adelante): bloque | anio | trimestre | dimension | categoria | indicador | valor
#   - Bloque D (fila 86 en adelante): igual estructura que C
#   - Bloque E (fila 111 en adelante): igual estructura que C
#   - Variable de edad para el universo "10 años y más": se asume "EDAD"
#     (ajustar EDAD_VAR más abajo si la base usa otro nombre, p.ej. "P.02").
#   - Beneficiario de plan (PPP.C / xMI.C): se asume código 1 = "Sí".
#     Ajustar si la codificación real es distinta.
# ============================================================

# ---- 1. LIBRERIAS ----
library(haven)
library(tidyverse)
library(srvyr)
library(survey)
library(googlesheets4)
library(lubridate)

# ---- 2. AUTENTICACION GOOGLE ----
gs4_auth(scopes = c(
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive"
))

SHEET_ID  <- "1LWho9JuhhsQ7mRcRov2Xba0e2P_TJyeHlnup8gxXvnc"
HOJA_DEST <- "ML_Dashboard"

# Nombre de la variable de edad en las bases (ajustar si corresponde)
EDAD_VAR <- "EDAD"

# ---- UTILIDADES ----

col_existe <- function(df, col) col %in% names(df)

a_num <- function(x) suppressWarnings(as.numeric(x))

etiquetar_estado <- function(x) {
  case_when(
    x == 1 ~ "Ocupado",
    x == 2 ~ "Desocupado",
    x == 3 ~ "Inactivo",
    TRUE   ~ as.character(x)
  )
}

# Extrae anio y trimestre del nombre de archivo "YYYY - EB - GC - XT.sav"
extraer_periodo <- function(nombre_archivo) {
  base_nombre <- basename(nombre_archivo)
  anio_str <- str_extract(base_nombre, "^\\d{4}")
  trim_str <- str_match(base_nombre, "(\\d)T")[, 2]
  list(anio = suppressWarnings(as.integer(anio_str)),
       trimestre = suppressWarnings(as.integer(trim_str)))
}

# ---- 3. LECTURA DE BASES ----

carpeta_bases <- "C:/Users/DELL/Documents/TRABAJO/DCPE/ENCUESTA_DE_BIENESTAR/BASES_BIENESTAR/GCBA"

archivos_sav <- list.files(carpeta_bases, pattern = "\\.sav$",
                            full.names = TRUE, ignore.case = TRUE)

if (length(archivos_sav) == 0) {
  stop("No se encontraron archivos .sav en: ", carpeta_bases)
}

info_archivos <- map(archivos_sav, extraer_periodo)

# Excluir 2021Q4 (duplicado exacto de 2021Q3)
es_2021q4 <- map_lgl(info_archivos, function(p) {
  !is.na(p$anio) && !is.na(p$trimestre) && p$anio == 2021 && p$trimestre == 4
})

if (any(es_2021q4)) {
  cat("Excluyendo archivo 2021Q4 (duplicado de 2021Q3):",
      paste(basename(archivos_sav[es_2021q4]), collapse = ", "), "\n")
}

archivos_sav <- archivos_sav[!es_2021q4]

leer_base <- function(archivo) {
  periodo <- extraer_periodo(archivo)

  if (is.na(periodo$anio) || is.na(periodo$trimestre)) {
    warning(sprintf("No se pudo extraer anio/trimestre de: %s (se omite)",
                     basename(archivo)))
    return(NULL)
  }

  cat(sprintf("Leyendo base: %s -> %dQ%d\n",
              basename(archivo), periodo$anio, periodo$trimestre))

  df <- tryCatch(
    read_sav(archivo),
    error = function(e) {
      warning(sprintf("No se pudo leer %s: %s", basename(archivo), e$message))
      NULL
    }
  )

  if (is.null(df)) return(NULL)

  df %>%
    zap_labels() %>%
    mutate(across(everything(), as.character)) %>%
    mutate(anio = periodo$anio, trimestre = periodo$trimestre)
}

lista_bases  <- compact(map(archivos_sav, leer_base))
base_completa <- bind_rows(lista_bases)

cat(sprintf("Trimestres cargados: %d\n", n_distinct(paste(base_completa$anio, base_completa$trimestre))))

# ---- 4. CALCULO DE INDICADORES ----

# -------------------- BLOQUE A: tasas generales por trimestre --------------------

calcular_bloque_A <- function(datos) {
  tiene_edad <- col_existe(datos, EDAD_VAR)

  datos %>%
    group_split(anio, trimestre) %>%
    map_dfr(function(datos_trim) {
      anio_t <- unique(datos_trim$anio)
      trim_t <- unique(datos_trim$trimestre)
      cat(sprintf("Bloque A - procesando %dQ%d\n", anio_t, trim_t))

      resultado <- tryCatch({
        datos_trim <- datos_trim %>%
          mutate(PONDERADOR = a_num(PONDERADOR),
                 ESTADO = a_num(ESTADO))

        if (tiene_edad) {
          datos_trim <- datos_trim %>%
            mutate(.edad = a_num(.data[[EDAD_VAR]])) %>%
            filter(!is.na(.edad), .edad >= 10)
        }

        datos_trim <- datos_trim %>% filter(!is.na(PONDERADOR))

        diseno <- as_survey_design(datos_trim, weights = PONDERADOR)

        t_actividad <- diseno %>%
          summarise(v = survey_mean(ESTADO %in% c(1, 2), na.rm = TRUE) * 100) %>%
          pull(v)

        t_empleo <- diseno %>%
          summarise(v = survey_mean(ESTADO == 1, na.rm = TRUE) * 100) %>%
          pull(v)

        t_desempleo <- diseno %>%
          filter(ESTADO %in% c(1, 2)) %>%
          summarise(v = survey_mean(ESTADO == 2, na.rm = TRUE) * 100) %>%
          pull(v)

        tibble(t_actividad = t_actividad, t_empleo = t_empleo, t_desempleo = t_desempleo)
      }, error = function(e) {
        warning(sprintf("Bloque A, %dQ%d: %s", anio_t, trim_t, e$message))
        tibble(t_actividad = NA_real_, t_empleo = NA_real_, t_desempleo = NA_real_)
      })

      bind_cols(tibble(bloque = "A_tasas", anio = anio_t, trimestre = trim_t), resultado)
    }) %>%
    arrange(anio, trimestre)
}

bloque_A <- calcular_bloque_A(base_completa)

# -------------------- Ultimo trimestre disponible (para bloques B a E) --------------------

ultimo_periodo <- base_completa %>%
  distinct(anio, trimestre) %>%
  arrange(desc(anio), desc(trimestre)) %>%
  slice(1)

anio_ult <- ultimo_periodo$anio
trim_ult <- ultimo_periodo$trimestre

cat(sprintf("Ultimo trimestre disponible: %dQ%d\n", anio_ult, trim_ult))

datos_ult <- base_completa %>%
  filter(anio == anio_ult, trimestre == trim_ult) %>%
  mutate(PONDERADOR = a_num(PONDERADOR),
         ESTADO = a_num(ESTADO))

diseno_ult <- as_survey_design(datos_ult, weights = PONDERADOR)

# -------------------- BLOQUE B: por genero, ultimo trimestre --------------------

calcular_bloque_B <- function(diseno) {
  cat(sprintf("Bloque B - procesando %dQ%d\n", anio_ult, trim_ult))

  tryCatch({
    tasas <- diseno %>%
      group_by(Sexo) %>%
      summarise(
        t_actividad = survey_mean(ESTADO %in% c(1, 2), na.rm = TRUE) * 100,
        t_empleo    = survey_mean(ESTADO == 1, na.rm = TRUE) * 100
      )

    desempleo <- diseno %>%
      filter(ESTADO %in% c(1, 2)) %>%
      group_by(Sexo) %>%
      summarise(t_desempleo = survey_mean(ESTADO == 2, na.rm = TRUE) * 100)

    ocupados <- diseno %>% filter(ESTADO == 1)

    ingreso <- tryCatch({
      ocupados %>%
        mutate(IT_ind = a_num(IT_ind)) %>%
        group_by(Sexo) %>%
        summarise(ingreso_medio = survey_median(IT_ind, na.rm = TRUE))
    }, error = function(e) {
      warning(sprintf("Bloque B, ingreso_medio: %s", e$message))
      tibble(Sexo = character(), ingreso_medio = numeric())
    })

    informalidad <- tryCatch({
      ocupados %>%
        mutate(E.7.g = a_num(`E.7.g`)) %>%
        group_by(Sexo) %>%
        summarise(informalidad = survey_mean(`E.7.g` == 2, na.rm = TRUE) * 100)
    }, error = function(e) {
      warning(sprintf("Bloque B, informalidad: %s", e$message))
      tibble(Sexo = character(), informalidad = numeric())
    })

    tasas %>%
      select(Sexo, t_actividad) %>%
      left_join(select(desempleo, Sexo, t_desempleo), by = "Sexo") %>%
      left_join(select(tasas, Sexo, t_empleo), by = "Sexo") %>%
      left_join(select(ingreso, Sexo, ingreso_medio), by = "Sexo") %>%
      left_join(select(informalidad, Sexo, informalidad), by = "Sexo") %>%
      transmute(
        bloque = "B_genero", anio = anio_ult, trimestre = trim_ult,
        sexo = Sexo, t_actividad, t_empleo, t_desempleo, ingreso_medio, informalidad
      )
  }, error = function(e) {
    warning(sprintf("Bloque B: %s", e$message))
    tibble(bloque = "B_genero", anio = anio_ult, trimestre = trim_ult,
           sexo = NA_character_, t_actividad = NA_real_, t_empleo = NA_real_,
           t_desempleo = NA_real_, ingreso_medio = NA_real_, informalidad = NA_real_)
  })
}

bloque_B <- calcular_bloque_B(diseno_ult)

# -------------------- BLOQUE C: informalidad, ultimo trimestre --------------------

calcular_tasa_informal <- function(diseno_ocupados, dimension, var_grupo = NULL) {
  cat(sprintf("Bloque C - dimension '%s'\n", dimension))

  tryCatch({
    diseno_ocupados <- diseno_ocupados %>% mutate(E.7.g = a_num(`E.7.g`))

    if (is.null(var_grupo)) {
      diseno_ocupados %>%
        summarise(valor = survey_mean(`E.7.g` == 2, na.rm = TRUE) * 100) %>%
        transmute(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
                  dimension = dimension, categoria = "Total",
                  indicador = "informalidad", valor)
    } else {
      diseno_ocupados %>%
        group_by(.data[[var_grupo]]) %>%
        summarise(valor = survey_mean(`E.7.g` == 2, na.rm = TRUE) * 100) %>%
        transmute(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
                  dimension = dimension, categoria = as.character(.data[[var_grupo]]),
                  indicador = "informalidad", valor)
    }
  }, error = function(e) {
    warning(sprintf("Bloque C, dimension '%s': %s", dimension, e$message))
    tibble(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
           dimension = dimension, categoria = NA_character_,
           indicador = "informalidad", valor = NA_real_)
  })
}

ocupados_ult <- diseno_ult %>% filter(ESTADO == 1)

c_general <- calcular_tasa_informal(ocupados_ult, "general")

c_cat_ocup <- if (col_existe(datos_ult, "CAT.OCUPACIONAL")) {
  calcular_tasa_informal(ocupados_ult, "cat_ocup", "CAT.OCUPACIONAL")
} else {
  tibble(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
         dimension = "cat_ocup", categoria = NA_character_,
         indicador = "informalidad", valor = NA_real_)
}

# Edad: usa GRAN.GRUPO si existe; si no, arma grupos etarios a partir de EDAD_VAR
if (col_existe(datos_ult, "GRAN.GRUPO")) {
  c_edad <- calcular_tasa_informal(ocupados_ult, "edad", "GRAN.GRUPO")
} else if (col_existe(datos_ult, EDAD_VAR)) {
  c_edad <- tryCatch({
    ocupados_ult %>%
      mutate(.grupo_edad = cut(
        a_num(.data[[EDAD_VAR]]),
        breaks = c(-Inf, 14, 24, 34, 44, 54, 64, Inf),
        labels = c("10-14", "15-24", "25-34", "35-44", "45-54", "55-64", "65+")
      )) %>%
      mutate(E.7.g = a_num(`E.7.g`)) %>%
      group_by(.grupo_edad) %>%
      summarise(valor = survey_mean(`E.7.g` == 2, na.rm = TRUE) * 100) %>%
      transmute(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
                dimension = "edad", categoria = as.character(.grupo_edad),
                indicador = "informalidad", valor)
  }, error = function(e) {
    warning(sprintf("Bloque C, dimension 'edad': %s", e$message))
    tibble(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
           dimension = "edad", categoria = NA_character_,
           indicador = "informalidad", valor = NA_real_)
  })
} else {
  c_edad <- tibble(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
                    dimension = "edad", categoria = NA_character_,
                    indicador = "informalidad", valor = NA_real_)
}

c_educacion <- if (col_existe(datos_ult, "MAX.EDUAM")) {
  calcular_tasa_informal(ocupados_ult, "educacion", "MAX.EDUAM")
} else {
  tibble(bloque = "C_informalidad", anio = anio_ult, trimestre = trim_ult,
         dimension = "educacion", categoria = NA_character_,
         indicador = "informalidad", valor = NA_real_)
}

bloque_C <- bind_rows(c_general, c_cat_ocup, c_edad, c_educacion)

# -------------------- BLOQUE D: ingresos y desempleo, ultimo trimestre --------------------

calcular_ingreso_por_grupo <- function(diseno_ocupados, dimension, var_grupo) {
  cat(sprintf("Bloque D - ingreso por '%s'\n", dimension))

  tryCatch({
    diseno_ocupados %>%
      mutate(IT_ind = a_num(IT_ind)) %>%
      group_by(.data[[var_grupo]]) %>%
      summarise(valor = survey_median(IT_ind, na.rm = TRUE)) %>%
      transmute(bloque = "D_ingresos", anio = anio_ult, trimestre = trim_ult,
                dimension = dimension, categoria = as.character(.data[[var_grupo]]),
                indicador = "ingreso_medio", valor)
  }, error = function(e) {
    warning(sprintf("Bloque D, dimension '%s': %s", dimension, e$message))
    tibble(bloque = "D_ingresos", anio = anio_ult, trimestre = trim_ult,
           dimension = dimension, categoria = NA_character_,
           indicador = "ingreso_medio", valor = NA_real_)
  })
}

d_ingreso_cat_ocup <- if (col_existe(datos_ult, "CAT.OCUPACIONAL")) {
  calcular_ingreso_por_grupo(ocupados_ult, "cat_ocup", "CAT.OCUPACIONAL")
} else {
  tibble(bloque = "D_ingresos", anio = anio_ult, trimestre = trim_ult,
         dimension = "cat_ocup", categoria = NA_character_,
         indicador = "ingreso_medio", valor = NA_real_)
}

d_ingreso_educacion <- if (col_existe(datos_ult, "MAX.EDUAM")) {
  calcular_ingreso_por_grupo(ocupados_ult, "educacion", "MAX.EDUAM")
} else {
  tibble(bloque = "D_ingresos", anio = anio_ult, trimestre = trim_ult,
         dimension = "educacion", categoria = NA_character_,
         indicador = "ingreso_medio", valor = NA_real_)
}

d_duracion_busqueda <- if (col_existe(datos_ult, "E.9.a")) {
  cat("Bloque D - distribucion duracion busqueda (E.9.a)\n")
  tryCatch({
    diseno_ult %>%
      filter(ESTADO == 2) %>%
      group_by(`E.9.a`) %>%
      summarise(valor = survey_mean(na.rm = TRUE) * 100) %>%
      transmute(bloque = "D_ingresos", anio = anio_ult, trimestre = trim_ult,
                dimension = "desempleo_duracion", categoria = as.character(`E.9.a`),
                indicador = "pct_desocupados", valor)
  }, error = function(e) {
    warning(sprintf("Bloque D, desempleo_duracion: %s", e$message))
    tibble(bloque = "D_ingresos", anio = anio_ult, trimestre = trim_ult,
           dimension = "desempleo_duracion", categoria = NA_character_,
           indicador = "pct_desocupados", valor = NA_real_)
  })
} else {
  tibble(bloque = "D_ingresos", anio = anio_ult, trimestre = trim_ult,
         dimension = "desempleo_duracion", categoria = NA_character_,
         indicador = "pct_desocupados", valor = NA_real_)
}

bloque_D <- bind_rows(d_ingreso_cat_ocup, d_ingreso_educacion, d_duracion_busqueda)

# -------------------- BLOQUE E: pobreza y planes, ultimo trimestre --------------------

e_nbi_por_estado <- if (col_existe(datos_ult, "NBI.TOTAL")) {
  cat("Bloque E - NBI por ESTADO\n")
  tryCatch({
    diseno_ult %>%
      mutate(NBI.TOTAL = a_num(`NBI.TOTAL`)) %>%
      group_by(ESTADO) %>%
      summarise(valor = survey_mean(`NBI.TOTAL` >= 1, na.rm = TRUE) * 100) %>%
      transmute(bloque = "E_pobreza", anio = anio_ult, trimestre = trim_ult,
                dimension = "nbi_por_estado", categoria = etiquetar_estado(ESTADO),
                indicador = "pct_nbi", valor)
  }, error = function(e) {
    warning(sprintf("Bloque E, nbi_por_estado: %s", e$message))
    tibble(bloque = "E_pobreza", anio = anio_ult, trimestre = trim_ult,
           dimension = "nbi_por_estado", categoria = NA_character_,
           indicador = "pct_nbi", valor = NA_real_)
  })
} else {
  tibble(bloque = "E_pobreza", anio = anio_ult, trimestre = trim_ult,
         dimension = "nbi_por_estado", categoria = NA_character_,
         indicador = "pct_nbi", valor = NA_real_)
}

e_planes_por_estado <- if (col_existe(datos_ult, "PPP.C") || col_existe(datos_ult, "xMI.C")) {
  cat("Bloque E - planes por ESTADO\n")
  tryCatch({
    diseno_ult %>%
      mutate(
        PPP.C = if (col_existe(datos_ult, "PPP.C")) a_num(`PPP.C`) else NA_real_,
        xMI.C = if (col_existe(datos_ult, "xMI.C")) a_num(`xMI.C`) else NA_real_
      ) %>%
      group_by(ESTADO) %>%
      summarise(valor = survey_mean(`PPP.C` == 1 | `xMI.C` == 1, na.rm = TRUE) * 100) %>%
      transmute(bloque = "E_pobreza", anio = anio_ult, trimestre = trim_ult,
                dimension = "planes_por_estado", categoria = etiquetar_estado(ESTADO),
                indicador = "pct_planes", valor)
  }, error = function(e) {
    warning(sprintf("Bloque E, planes_por_estado: %s", e$message))
    tibble(bloque = "E_pobreza", anio = anio_ult, trimestre = trim_ult,
           dimension = "planes_por_estado", categoria = NA_character_,
           indicador = "pct_planes", valor = NA_real_)
  })
} else {
  tibble(bloque = "E_pobreza", anio = anio_ult, trimestre = trim_ult,
         dimension = "planes_por_estado", categoria = NA_character_,
         indicador = "pct_planes", valor = NA_real_)
}

bloque_E <- bind_rows(e_nbi_por_estado, e_planes_por_estado)

# ---- 5. ESCRITURA EN GOOGLE SHEETS ----

escribir_bloque <- function(data, fila_inicio, nombre_bloque) {
  cat(sprintf("Escribiendo %s en fila %d...\n", nombre_bloque, fila_inicio))
  tryCatch({
    range_write(
      ss = SHEET_ID,
      data = data,
      sheet = HOJA_DEST,
      range = paste0("A", fila_inicio),
      col_names = FALSE,
      reformat = FALSE
    )
    cat(sprintf("%s escrito correctamente (%d filas).\n", nombre_bloque, nrow(data)))
  }, error = function(e) {
    warning(sprintf("Error al escribir %s: %s", nombre_bloque, e$message))
  })
}

escribir_bloque(bloque_A, 2,   "Bloque A (tasas)")
escribir_bloque(bloque_B, 41,  "Bloque B (genero)")
escribir_bloque(bloque_C, 56,  "Bloque C (informalidad)")
escribir_bloque(bloque_D, 86,  "Bloque D (ingresos)")
escribir_bloque(bloque_E, 111, "Bloque E (pobreza)")

# ---- 6. MENSAJE FINAL ----

cat(sprintf("ML_Dashboard actualizado correctamente — %s\n",
            format(now(), "%Y-%m-%d %H:%M:%S")))
