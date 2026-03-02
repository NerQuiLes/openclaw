# 🔱 Gestión del Fork de OpenClaw

## 📊 Estado Actual

- **Fork**: [NerQuiLes/openclaw](https://github.com/NerQuiLes/openclaw.git)
- **Upstream**: [openclaw/openclaw](https://github.com/openclaw/openclaw.git)
- **Rama principal**: `kairos-evo`
- **Commits locales adelante**: 8 (personalizaciones Kairos + merge 2026-03-02)
- **Estado**: ✅ Actualizado con upstream (merge upstream/main 2026-03-02)

## 🛡️ Archivos Críticos Protegidos

Los siguientes archivos contienen personalizaciones de Ner y deben ser protegidos:

```
.agents/skills/*kairos*     # Skills personalizados de Kairos
src/auth/*                  # Configuraciones de autenticación
src/slack/*                 # Integraciones de Slack
.env*                       # Variables de entorno
*.xcconfig                  # Configuraciones de firma iOS
config/*                    # Configuraciones generales
```

## 🚀 Comandos Rápidos

### Verificar estado del fork

```bash
cd /root/kairos-evo/openclaw
git fetch upstream
git log HEAD..upstream/main --oneline   # Ver commits nuevos en upstream
git log upstream/main..HEAD --oneline   # Ver tus commits locales
```

### Actualizar fork de forma segura

```bash
# Método recomendado (con backups automáticos)
./scripts/update-fork-safe.sh

# Método manual (sin script)
git fetch upstream
git merge upstream/main
```

### Ver archivos modificados

```bash
# Ver todos los archivos modificados respecto a tu fork remoto
git diff fork/kairos-evo..HEAD --name-status

# Ver estadísticas de cambios
git diff fork/kairos-evo..HEAD --stat
```

### Pushear cambios a tu fork

```bash
# Pushear rama actual
git push fork kairos-evo

# Forzar push (¡cuidado!)
git push fork kairos-evo --force-with-lease
```

## 🔄 Flujo de Trabajo Recomendado

### 1. Antes de actualizar

```bash
# Verificar que no hay cambios sin commit
git status

# Si hay cambios, commitear o stashear
git stash
```

### 2. Actualizar con el script de seguridad

```bash
./scripts/update-fork-safe.sh
```

El script automáticamente:

- ✅ Crea backup completo del repositorio
- ✅ Guarda archivos críticos
- ✅ Muestra commits nuevos
- ✅ Realiza el merge de forma segura
- ✅ Detecta conflictos automáticamente

### 3. Si hay conflictos

```bash
# Ver archivos en conflicto
git status

# Resolver conflictos manualmente
# Editar archivos marcados con <<<<<<< HEAD

# Marcar como resueltos
git add <archivo-resuelto>

# Completar el merge
git commit
```

### 4. Después de actualizar

```bash
# Verificar que todo funciona
npm test

# Pushear a tu fork
git push fork kairos-evo
```

## 🆘 Comandos de Emergencia

### Abortar un merge en progreso

```bash
git merge --abort
```

### Revertir último commit

```bash
git reset --hard ORIG_HEAD
```

### Restaurar desde backup

```bash
# El script crea backups en:
# /root/kairos-evo/backups/openclaw/update-YYYYMMDD-HHMMSS/

# Para restaurar:
cd /root/kairos-evo/backups/openclaw/update-YYYYMMDD-HHMMSS/
git bundle unbundle repo-bundle.git
```

### Ver diferencias con versión específica

```bash
# Ver cambios desde un commit específico
git diff <commit-hash> -- <archivo>

# Ver estado en un punto específico
git show <commit-hash>:<ruta/archivo>
```

## 📋 Checklist de Actualización

- [ ] Verificar estado actual: `git status`
- [ ] Fetch upstream: `git fetch upstream`
- [ ] Revisar commits nuevos: `git log HEAD..upstream/main --oneline`
- [ ] Ejecutar script de actualización: `./scripts/update-fork-safe.sh`
- [ ] Resolver conflictos si existen
- [ ] Verificar funcionamiento: `npm test`
- [ ] Pushear a fork: `git push fork kairos-evo`
- [ ] Verificar en GitHub que todo está correcto

## 🔍 Resolución de Conflictos Comunes

### Conflictos en archivos de configuración

```bash
# Mantener tu versión
git checkout --ours <archivo>

# Usar versión de upstream
git checkout --theirs <archivo>

# Después de decidir:
git add <archivo>
```

### Conflictos en package.json

```bash
# Aceptar ambas versiones y resolver manualmente
# Editar el archivo, mantener dependencias necesarias de ambos lados
git add package.json
npm install  # Actualizar lockfile
```

### Conflictos en código fuente

```bash
# Buscar marcadores de conflicto
grep -r "<<<<<<< HEAD" .

# Resolver manualmente cada uno
# Buscar: <<<<<<< HEAD
# Tu código: entre <<<<<<< y =======
# Código upstream: entre ======= y >>>>>>>
```

## 📚 Recursos Adicionales

- [Documentación Git - Merge Conflicts](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)
- [GitHub - Fork a repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
- [GitHub - Syncing a fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork)

## 🤝 Mantener Fork Limpio

### Sincronizar periódicamente

```bash
# Recomendado: cada 1-2 semanas
git fetch upstream
./scripts/update-fork-safe.sh
```

### Revisar archivos modificados

```bash
# Ver qué has cambiado respecto a upstream
git diff upstream/main --name-status
```

### Documentar cambios importantes

```bash
# Mantener un log de personalizaciones
# en: docs/PERSONALIZACIONES_NER.md
```

---

**Última actualización**: 19 de febrero de 2026
**Mantenido por**: Ner (NerQuiLes)
