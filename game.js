class TowerOfHanoi {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.controls = null;
        this.towers = [];
        this.disks = [];
        this.selectedDisk = null;
        this.selectedTower = null;
        this.moveHistory = [];
        this.gameStarted = false;
        this.timeLimit = 0;
        this.timeRemaining = 0;
        this.moveCount = 0;
        this.timer = null;

        // Adicionar estado do jogo
        this.isGameActive = false;
        this.selectedTime = null;
        this.moveValidationEnabled = true;

        // Adicionar estados do jogo
        this.isMoving = false; // Previne múltiplos movimentos simultâneos
        this.targetTower = 2; // Torre de destino (direita)
        this.minMovesRequired = 255; // Mínimo de movimentos necessários para 8 discos (2^8 - 1)

        // Adicionar estados para drag and drop
        this.dragHeight = 3; // Aumentar altura do disco durante o arrasto para melhor visibilidade
        this.dragSpeed = 0.15; // Aumentar velocidade de movimento
        this.snapDistance = 2; // Distância para "grudar" na torre
        this.hoverDisk = null;
        this.hoverTower = null;
        this.isDragging = false;
        this.dragDisk = null;
        this.dragStartPosition = null;
        this.dragPlane = new THREE.Plane();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.intersectionPoint = new THREE.Vector3();
        this.originalDiskPosition = null;
        this.dragOffset = new THREE.Vector3();

        // Sistema de áudio
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.backgroundMusic = null;
        this.soundEffects = {
            move: null,
            invalid: null,
            win: null,
            select: null
        };
        this.isMusicPlaying = false;
        this.currentMusicIndex = 0;

        // Lista de músicas angolanas (URLs dos arquivos de áudio)
        this.musicList = [
            'sounds/kuduro1.mp3',
            'sounds/kizomba1.mp3',
            'sounds/semba1.mp3',
            'sounds/afrohouse1.mp3'
        ];

        // Efeitos sonoros
        this.soundEffectsList = {
            move: 'sounds/move.mp3',
            invalid: 'sounds/invalid.mp3',
            win: 'sounds/win.mp3',
            select: 'sounds/select.mp3'
        };

        // Melhorias visuais
        this.particles = [];
        this.ambientParticles = [];
        this.lights = [];
        this.postProcessing = null;

        // Adicionar estados para validação de movimentos
        this.invalidMoveFeedback = {
            duration: 300,
            color: 0xff0000,
            flashCount: 2
        };

        // Ajustar ordem dos discos (0 = menor, 7 = maior)
        this.diskOrder = {
            smallest: 0,
            largest: 7
        };

        this.init();
        this.setupEventListeners();
        this.loadAudio();
        this.setupPostProcessing();
    }

    init() {
        // Configurar renderer
        const container = document.getElementById('gameCanvas');
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setClearColor(0xf0f0f0);
        container.appendChild(this.renderer.domElement);

        // Configurar câmera
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        // Adicionar controles de órbita
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 20;

        // Adicionar iluminação
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        // Criar elementos do jogo
        this.createBase();
        this.createTowers();
        this.createDisks();

        // Iniciar loop de animação
        this.animate();
    }

    createBase() {
        const baseGeometry = new THREE.BoxGeometry(12, 0.5, 4);
        const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = -0.25;
        this.scene.add(base);
    }

    createTowers() {
        const towerGeometry = new THREE.CylinderGeometry(0.2, 0.2, 3, 32);
        const towerMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });

        for (let i = -1; i <= 1; i++) {
            const tower = new THREE.Mesh(towerGeometry, towerMaterial);
            tower.position.set(i * 4, 1.5, 0);
            this.scene.add(tower);
            this.towers.push({
                mesh: tower,
                disks: []
            });
        }
    }

    createDisks() {
        const colors = [
            0xff0000, 0xff7f00, 0xffff00, 0x00ff00,
            0x0000ff, 0x4b0082, 0x9400d3, 0xff1493
        ];

        // Criar discos do maior (base) para o menor (topo)
        for (let i = 7; i >= 0; i--) {
            const radius = 1.5 - (i * 0.15); // Maior disco tem maior raio
            const height = 0.3;
            const diskGeometry = new THREE.CylinderGeometry(radius, radius, height, 32);
            const diskMaterial = new THREE.MeshPhongMaterial({ 
                color: colors[i],
                shininess: 30
            });
            const disk = new THREE.Mesh(diskGeometry, diskMaterial);
            
            // Posicionar discos na ordem correta (maior embaixo, menor em cima)
            const diskIndex = 7 - i; // Agora i=7 é o maior disco (base)
            disk.position.set(-4, 0.15 + (diskIndex * 0.3), 0);
            
            disk.userData.isDisk = true;
            disk.userData.diskIndex = diskIndex;
            
            this.scene.add(disk);
            
            this.disks.push({
                mesh: disk,
                size: diskIndex, // size agora representa o tamanho real (0 = menor, 7 = maior)
                currentTower: 0
            });
            
            // Adicionar disco à torre inicial (maior embaixo, menor em cima)
            this.towers[0].disks.push(diskIndex);
        }
    }

    setupEventListeners() {
        // Eventos de clique nos botões de tempo
        document.querySelectorAll('.time-settings button').forEach(button => {
            button.addEventListener('click', (e) => {
                if (this.isGameActive) {
                    alert('Por favor, termine ou reinicie o jogo atual antes de selecionar um novo tempo!');
                    return;
                }

                document.querySelectorAll('.time-settings button').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.selectedTime = parseInt(e.target.dataset.time);
                this.timeLimit = this.selectedTime;
                document.getElementById('timeRemaining').textContent = this.formatTime(this.timeLimit);
                document.getElementById('startGame').disabled = false;
            });
        });

        // Eventos dos botões de controle
        document.getElementById('startGame').addEventListener('click', () => this.startGame());
        document.getElementById('undoMove').addEventListener('click', () => this.undoMove());
        document.getElementById('resetGame').addEventListener('click', () => this.resetGame());

        // Evento de clique no canvas
        this.renderer.domElement.addEventListener('click', (event) => this.handleClick(event));

        // Evento de redimensionamento
        window.addEventListener('resize', () => this.handleResize());

        // Eventos de mouse melhorados
        this.renderer.domElement.addEventListener('mousedown', (event) => this.handleMouseDown(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this.handleMouseMove(event));
        this.renderer.domElement.addEventListener('mouseup', (event) => this.handleMouseUp(event));
        this.renderer.domElement.addEventListener('mouseleave', () => this.handleMouseUp());
        
        // Adicionar eventos de hover
        this.renderer.domElement.addEventListener('mousemove', (event) => this.handleHover(event));

        // Prevenir comportamento padrão do navegador
        this.renderer.domElement.addEventListener('dragstart', (e) => e.preventDefault());
    }

    handleClick(event) {
        if (!this.isGameActive || this.isMoving) return;

        // Converter posição do mouse para coordenadas normalizadas
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Verificar clique em disco
        const diskIntersects = this.raycaster.intersectObjects(this.disks.map(d => d.mesh));
        if (diskIntersects.length > 0) {
            const diskIndex = this.disks.findIndex(d => d.mesh === diskIntersects[0].object);
            const disk = this.disks[diskIndex];
            const tower = this.towers[disk.currentTower];

            // Verificar se o disco está no topo da torre
            if (tower.disks[tower.disks.length - 1] === diskIndex) {
                this.selectDisk(diskIndex);
                return;
            }
        }

        // Verificar clique em torre
        const towerIntersects = this.raycaster.intersectObjects(this.towers.map(t => t.mesh));
        if (towerIntersects.length > 0 && this.selectedDisk !== null) {
            const towerIndex = this.towers.findIndex(t => t.mesh === towerIntersects[0].object);
            this.selectTower(towerIndex);
        }
    }

    selectDisk(diskIndex) {
        // Desselecionar disco anterior se houver
        if (this.selectedDisk !== null) {
            this.disks[this.selectedDisk].mesh.material.emissive.setHex(0x000000);
        }

        this.selectedDisk = diskIndex;
        const disk = this.disks[diskIndex];

        // Destacar disco selecionado
        disk.mesh.material.emissive.setHex(0x666666);

        // Destacar torres válidas e mostrar feedback visual
        this.highlightValidTowers(disk);

        // Adicionar tooltip com informações do disco
        this.showDiskInfo(disk);
    }

    selectTower(towerIndex) {
        if (this.selectedDisk === null) return;

        const disk = this.disks[this.selectedDisk];
        const targetTower = this.towers[towerIndex];

        // Resetar destaque das torres
        this.towers.forEach(tower => {
            tower.mesh.material.emissive.setHex(0x000000);
        });

        // Verificar se o movimento é válido
        if (this.isValidMove(disk, towerIndex)) {
            this.isMoving = true;
            this.moveDisk(this.selectedDisk, towerIndex).then(() => {
                this.isMoving = false;
                if (this.checkWin()) {
                    this.handleWin();
                }
            });
        }

        // Resetar seleção
        disk.mesh.material.emissive.setHex(0x000000);
        this.selectedDisk = null;
    }

    highlightValidTowers(disk) {
        // Resetar todas as torres
        this.towers.forEach(tower => {
            tower.mesh.material.emissive.setHex(0x000000);
        });

        // Destacar torres válidas com feedback visual
        this.towers.forEach((tower, index) => {
            if (this.isValidMove(disk, index)) {
                // Destacar torre válida
                tower.mesh.material.emissive.setHex(0x00ff00);
                
                // Adicionar tooltip na torre
                this.showTowerInfo(tower, disk);
            }
        });
    }

    isValidMove(disk, targetTowerIndex) {
        if (!this.moveValidationEnabled) return false;
        
        const tower = this.towers[targetTowerIndex];
        const sourceTower = this.towers[disk.currentTower];
        
        // Não permitir mover para a mesma torre
        if (disk.currentTower === targetTowerIndex) {
            this.showInvalidMoveFeedback(disk.mesh, "Não é possível mover para a mesma torre");
            return false;
        }

        // Verificar se o disco está no topo da torre atual
        if (sourceTower.disks[sourceTower.disks.length - 1] !== this.disks.indexOf(disk)) {
            this.showInvalidMoveFeedback(disk.mesh, "Apenas o disco do topo pode ser movido");
            return false;
        }
        
        // Se a torre de destino estiver vazia, o movimento é válido
        if (tower.disks.length === 0) {
            return true;
        }
        
        // Pegar o disco do topo da torre de destino
        const topDiskIndex = tower.disks[tower.disks.length - 1];
        const topDisk = this.disks[topDiskIndex];
        
        // O movimento é válido se o disco que está sendo movido for MENOR que o disco do topo
        if (disk.size >= topDisk.size) {
            this.showInvalidMoveFeedback(disk.mesh, "Não é possível colocar um disco maior sobre um menor");
            return false;
        }

        return true;
    }

    moveDisk(diskIndex, targetTowerIndex) {
        const disk = this.disks[diskIndex];
        const sourceTower = this.towers[disk.currentTower];
        const targetTower = this.towers[targetTowerIndex];

        // Verificar se o movimento é válido
        if (!this.isValidMove(disk, targetTowerIndex)) {
            return Promise.reject("Movimento inválido");
        }

        // Remover disco da torre atual (sempre o último da lista, pois é o do topo)
        sourceTower.disks.pop();

        // Adicionar disco à nova torre (sempre no final da lista, para ficar no topo)
        targetTower.disks.push(diskIndex);
        disk.currentTower = targetTowerIndex;

        // Calcular nova posição
        const newY = 0.15 + ((targetTower.disks.length - 1) * 0.3);
        const newX = (targetTowerIndex - 1) * 4;

        // Animar movimento
        return this.animateDiskMove(disk.mesh, newX, newY).then(() => {
            // Registrar movimento
            this.moveHistory.push({
                diskIndex,
                fromTower: disk.currentTower,
                toTower: targetTowerIndex
            });

            // Atualizar contador de movimentos
            this.moveCount++;
            document.getElementById('moveCount').textContent = this.moveCount;

            // Tocar som de movimento
            this.playSoundEffect('move');

            // Verificar vitória
            if (this.checkWin()) {
                this.handleWin();
            }
        });
    }

    animateDiskMove(disk, targetX, targetY) {
        return new Promise(resolve => {
            const startX = disk.position.x;
            const startY = disk.position.y;
            const duration = 500;
            const startTime = Date.now();

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Curva de animação suave
                const easeProgress = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

                disk.position.x = startX + (targetX - startX) * easeProgress;
                disk.position.y = startY + (targetY - startY) * easeProgress;

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };

            animate();
        });
    }

    startGame() {
        if (!this.selectedTime) {
            alert('Por favor, selecione um tempo antes de iniciar o jogo!');
            return;
        }

        this.isGameActive = true;
        this.gameStarted = true;
        this.timeRemaining = this.timeLimit;
        this.moveCount = 0;
        this.moveHistory = [];
        this.moveValidationEnabled = true;

        // Atualizar UI
        document.getElementById('moveCount').textContent = '0';
        document.getElementById('startGame').disabled = true;
        document.getElementById('undoMove').disabled = false;
        document.querySelectorAll('.time-settings button').forEach(btn => btn.disabled = true);

        // Iniciar timer
        this.timer = setInterval(() => {
            this.timeRemaining--;
            document.getElementById('timeRemaining').textContent = this.formatTime(this.timeRemaining);

            if (this.timeRemaining <= 0) {
                this.handleTimeUp();
            }
        }, 1000);

        // Iniciar música
        if (!this.isMusicPlaying) {
            this.isMusicPlaying = true;
            this.audioContext.resume().then(() => {
                this.backgroundMusic.play();
            });
        }
    }

    resetGame() {
        // Limpar timer
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Resetar estado do jogo
        this.isGameActive = false;
        this.gameStarted = false;
        this.selectedDisk = null;
        this.moveHistory = [];
        this.moveCount = 0;
        this.timeRemaining = this.selectedTime || 0;
        this.moveValidationEnabled = true;

        // Resetar UI
        document.getElementById('startGame').disabled = !this.selectedTime;
        document.getElementById('undoMove').disabled = true;
        document.getElementById('moveCount').textContent = '0';
        document.getElementById('timeRemaining').textContent = this.formatTime(this.timeRemaining);
        document.querySelectorAll('.time-settings button').forEach(btn => btn.disabled = false);

        // Resetar posições dos discos na ordem correta (maior embaixo, menor em cima)
        this.disks.forEach((disk, index) => {
            disk.currentTower = 0;
            disk.mesh.position.set(-4, 0.15 + (index * 0.3), 0);
            disk.mesh.material.emissive.setHex(0x000000);
            this.towers[0].disks.push(index); // Adicionar na ordem correta (maior embaixo)
        });
    }

    undoMove() {
        if (this.moveHistory.length === 0) return;

        const lastMove = this.moveHistory.pop();
        const disk = this.disks[lastMove.diskIndex];
        const currentTower = this.towers[disk.currentTower];
        const targetTower = this.towers[lastMove.fromTower];

        // Remover disco da torre atual (sempre o primeiro da lista)
        currentTower.disks.shift();

        // Adicionar disco à torre anterior (sempre no início da lista)
        targetTower.disks.unshift(lastMove.diskIndex);
        disk.currentTower = lastMove.fromTower;

        // Atualizar posição do disco
        const newY = 0.15 + ((7 - targetTower.disks.indexOf(lastMove.diskIndex)) * 0.3);
        const newX = (lastMove.fromTower - 1) * 4;

        // Animar movimento
        this.animateDiskMove(disk.mesh, newX, newY);

        // Atualizar contador de movimentos
        this.moveCount--;
        document.getElementById('moveCount').textContent = this.moveCount;
    }

    handleTimeUp() {
        clearInterval(this.timer);
        this.gameStarted = false;
        this.isGameActive = false;
        document.getElementById('startGame').disabled = false;
        alert('Tempo esgotado! Tente novamente.');
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    handleResize() {
        const container = document.getElementById('gameCanvas');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    handleHover(event) {
        if (this.isDragging) return;

        // Converter posição do mouse para coordenadas normalizadas
        this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Verificar hover sobre discos
        const diskIntersects = this.raycaster.intersectObjects(this.disks.map(d => d.mesh));
        if (diskIntersects.length > 0) {
            const diskIndex = this.disks.findIndex(d => d.mesh === diskIntersects[0].object);
            const disk = this.disks[diskIndex];
            const tower = this.towers[disk.currentTower];

            // Verificar se o disco está no topo da torre
            if (tower.disks[tower.disks.length - 1] === diskIndex) {
                if (this.hoverDisk !== diskIndex) {
                    // Resetar disco anterior
                    if (this.hoverDisk !== null) {
                        this.disks[this.hoverDisk].mesh.material.emissive.setHex(0x000000);
                    }
                    this.hoverDisk = diskIndex;
                    // Destacar disco atual
                    disk.mesh.material.emissive.setHex(0x333333);
                }
            }
        } else {
            // Resetar hover do disco
            if (this.hoverDisk !== null) {
                this.disks[this.hoverDisk].mesh.material.emissive.setHex(0x000000);
                this.hoverDisk = null;
            }
        }

        // Verificar hover sobre torres
        const towerIntersects = this.raycaster.intersectObjects(this.towers.map(t => t.mesh));
        if (towerIntersects.length > 0) {
            const towerIndex = this.towers.findIndex(t => t.mesh === towerIntersects[0].object);
            if (this.hoverTower !== towerIndex) {
                // Resetar torre anterior
                if (this.hoverTower !== null) {
                    this.towers[this.hoverTower].mesh.material.emissive.setHex(0x000000);
                }
                this.hoverTower = towerIndex;
                // Destacar torre atual
                this.towers[towerIndex].mesh.material.emissive.setHex(0x333333);
            }
        } else {
            // Resetar hover da torre
            if (this.hoverTower !== null) {
                this.towers[this.hoverTower].mesh.material.emissive.setHex(0x000000);
                this.hoverTower = null;
            }
        }
    }

    handleMouseDown(event) {
        if (!this.isGameActive || this.isMoving) return;

        // Converter posição do mouse para coordenadas normalizadas
        this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Verificar interseção com discos
        const diskIntersects = this.raycaster.intersectObjects(this.disks.map(d => d.mesh));
        if (diskIntersects.length > 0) {
            const diskIndex = this.disks.findIndex(d => d.mesh === diskIntersects[0].object);
            const disk = this.disks[diskIndex];
            const tower = this.towers[disk.currentTower];

            // Verificar se o disco está no topo da torre
            if (tower.disks[tower.disks.length - 1] === diskIndex) {
                this.isDragging = true;
                this.dragDisk = disk;
                this.originalDiskPosition = disk.mesh.position.clone();
                this.dragStartPosition = new THREE.Vector3(
                    event.clientX,
                    event.clientY,
                    0
                );

                // Criar plano de arrasto paralelo à câmera
                const normal = new THREE.Vector3(0, 0, 1);
                normal.applyQuaternion(this.camera.quaternion);
                this.dragPlane.setFromNormalAndCoplanarPoint(normal, disk.mesh.position);

                // Calcular offset do clique
                const intersection = new THREE.Vector3();
                this.raycaster.ray.intersectPlane(this.dragPlane, intersection);
                this.dragOffset.copy(disk.mesh.position).sub(intersection);

                // Efeitos visuais
                disk.mesh.material.emissive.setHex(0x666666);
                disk.mesh.material.opacity = 0.8;
                disk.mesh.material.transparent = true;

                // Destacar torres válidas
                this.highlightValidTowers(disk);
            }
        }
    }

    handleMouseMove(event) {
        if (!this.isDragging || !this.dragDisk) return;

        // Atualizar posição do mouse
        this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1;

        // Calcular nova posição do disco
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint)) {
            // Aplicar offset e manter altura durante o arrasto
            const newPosition = this.intersectionPoint.add(this.dragOffset);
            this.dragDisk.mesh.position.x = newPosition.x;
            this.dragDisk.mesh.position.z = newPosition.z;
            this.dragDisk.mesh.position.y = this.dragHeight;

            // Verificar torre mais próxima
            let closestTower = null;
            let minDistance = Infinity;

            this.towers.forEach((tower, index) => {
                const distance = Math.abs(tower.mesh.position.x - this.dragDisk.mesh.position.x);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestTower = { tower, index };
                }
            });

            // Destacar torre mais próxima se for válida
            this.towers.forEach((tower, index) => {
                if (closestTower && index === closestTower.index && 
                    this.isValidMove(this.dragDisk, index)) {
                    tower.mesh.material.emissive.setHex(0x00ff00);
                } else {
                    tower.mesh.material.emissive.setHex(0x000000);
                }
            });
        }
    }

    handleMouseUp(event) {
        if (!this.isDragging || !this.dragDisk) return;

        // Encontrar torre mais próxima
        let closestTower = null;
        let minDistance = Infinity;

        this.towers.forEach((tower, index) => {
            const distance = Math.abs(tower.mesh.position.x - this.dragDisk.mesh.position.x);
            if (distance < minDistance) {
                minDistance = distance;
                closestTower = { tower, index };
            }
        });

        // Resetar estado visual do disco
        this.dragDisk.mesh.material.emissive.setHex(0x000000);
        this.dragDisk.mesh.material.opacity = 1;
        this.dragDisk.mesh.material.transparent = false;

        // Resetar destaque das torres
        this.towers.forEach(tower => {
            tower.mesh.material.emissive.setHex(0x000000);
        });

        if (closestTower && this.isValidMove(this.dragDisk, closestTower.index)) {
            // Movimento válido
            this.isMoving = true;
            this.moveDisk(this.disks.indexOf(this.dragDisk), closestTower.index).then(() => {
                this.isMoving = false;
                if (this.checkWin()) {
                    this.handleWin();
                }
            });
        } else {
            // Movimento inválido - retornar à posição original
            this.animateDiskMove(
                this.dragDisk.mesh,
                this.originalDiskPosition.x,
                this.originalDiskPosition.y
            );
            this.showInvalidMoveFeedback(this.dragDisk.mesh, "Movimento inválido");
            this.playSoundEffect('invalid');
        }

        // Resetar estado de arrasto
        this.isDragging = false;
        this.dragDisk = null;
        this.dragStartPosition = null;
        this.originalDiskPosition = null;
    }

    async loadAudio() {
        try {
            // Carregar efeitos sonoros
            for (const [key, path] of Object.entries(this.soundEffectsList)) {
                const response = await fetch(path);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                this.soundEffects[key] = audioBuffer;
            }

            // Iniciar música de fundo
            this.playNextMusic();
        } catch (error) {
            console.warn('Alguns arquivos de áudio não puderam ser carregados:', error);
        }
    }

    async playNextMusic() {
        if (this.backgroundMusic) {
            this.backgroundMusic.stop();
        }

        try {
            const response = await fetch(this.musicList[this.currentMusicIndex]);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.backgroundMusic = new Audio();
            this.backgroundMusic.src = URL.createObjectURL(new Blob([arrayBuffer]));
            this.backgroundMusic.loop = false;
            this.backgroundMusic.volume = 0.5;

            this.backgroundMusic.onended = () => {
                this.currentMusicIndex = (this.currentMusicIndex + 1) % this.musicList.length;
                this.playNextMusic();
            };

            if (this.isMusicPlaying) {
                this.backgroundMusic.play();
            }
        } catch (error) {
            console.warn('Não foi possível carregar a música:', error);
        }
    }

    playSoundEffect(effectName) {
        if (this.soundEffects[effectName]) {
            const source = this.audioContext.createBufferSource();
            source.buffer = this.soundEffects[effectName];
            source.connect(this.audioContext.destination);
            source.start();
        }
    }

    setupPostProcessing() {
        // Configurar pós-processamento para melhorar a qualidade visual
        const composer = new THREE.EffectComposer(this.renderer);
        
        // Render pass
        const renderPass = new THREE.RenderPass(this.scene, this.camera);
        composer.addPass(renderPass);

        // Bloom effect
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        composer.addPass(bloomPass);

        // Color correction
        const colorPass = new THREE.ShaderPass(THREE.ColorCorrectionShader);
        colorPass.uniforms.powRGB.value = new THREE.Vector3(1.1, 1.1, 1.1);
        composer.addPass(colorPass);

        this.postProcessing = composer;
    }

    createAmbientParticles() {
        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const particleSizes = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            particlePositions[i3] = (Math.random() - 0.5) * 20;
            particlePositions[i3 + 1] = Math.random() * 10;
            particlePositions[i3 + 2] = (Math.random() - 0.5) * 20;
            particleSizes[i] = Math.random() * 0.1;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

        const particleMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);
        this.ambientParticles.push(particles);
    }

    createEnvironment() {
        // Adicionar plano de fundo
        const backgroundGeometry = new THREE.PlaneGeometry(50, 50);
        const backgroundMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.5,
            roughness: 0.5,
            side: THREE.DoubleSide
        });
        const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
        background.rotation.x = Math.PI / 2;
        background.position.y = -2;
        this.scene.add(background);

        // Adicionar elementos decorativos
        this.createDecorations();
    }

    createDecorations() {
        // Adicionar elementos decorativos ao redor do jogo
        const decorationGeometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16);
        const decorationMaterial = new THREE.MeshStandardMaterial({
            color: 0x4444ff,
            metalness: 0.8,
            roughness: 0.2,
            transparent: true,
            opacity: 0.6
        });

        for (let i = 0; i < 4; i++) {
            const decoration = new THREE.Mesh(decorationGeometry, decorationMaterial);
            const angle = (i / 4) * Math.PI * 2;
            decoration.position.set(
                Math.cos(angle) * 8,
                2,
                Math.sin(angle) * 8
            );
            decoration.rotation.x = Math.PI / 4;
            decoration.rotation.y = angle;
            this.scene.add(decoration);
        }
    }

    createWinParticles() {
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 2;
            positions[i3 + 1] = Math.random() * 2;
            positions[i3 + 2] = (Math.random() - 0.5) * 2;

            colors[i3] = Math.random();
            colors[i3 + 1] = Math.random();
            colors[i3 + 2] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });

        const particles = new THREE.Points(geometry, material);
        particles.position.set(0, 2, 0);
        this.scene.add(particles);

        // Animar partículas
        const animate = () => {
            particles.rotation.y += 0.01;
            particles.position.y += 0.02;
            particles.material.opacity -= 0.01;

            if (particles.material.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(particles);
            }
        };

        animate();
    }

    showInvalidMoveFeedback(mesh, message) {
        // Criar ou atualizar mensagem de feedback
        let feedbackElement = document.getElementById('moveFeedback');
        if (!feedbackElement) {
            feedbackElement = document.createElement('div');
            feedbackElement.id = 'moveFeedback';
            feedbackElement.style.position = 'fixed';
            feedbackElement.style.top = '20px';
            feedbackElement.style.left = '50%';
            feedbackElement.style.transform = 'translateX(-50%)';
            feedbackElement.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
            feedbackElement.style.color = 'white';
            feedbackElement.style.padding = '10px 20px';
            feedbackElement.style.borderRadius = '5px';
            feedbackElement.style.zIndex = '1000';
            feedbackElement.style.textAlign = 'center';
            feedbackElement.style.transition = 'opacity 0.3s';
            document.body.appendChild(feedbackElement);
        }

        // Mostrar mensagem
        feedbackElement.textContent = message;
        feedbackElement.style.opacity = '1';

        // Efeito visual no disco
        const originalColor = mesh.material.emissive.getHex();
        const flashDisk = (count) => {
            if (count <= 0) {
                mesh.material.emissive.setHex(originalColor);
                feedbackElement.style.opacity = '0';
                return;
            }

            mesh.material.emissive.setHex(this.invalidMoveFeedback.color);
            setTimeout(() => {
                mesh.material.emissive.setHex(originalColor);
                setTimeout(() => flashDisk(count - 1), this.invalidMoveFeedback.duration / 2);
            }, this.invalidMoveFeedback.duration / 2);
        };

        flashDisk(this.invalidMoveFeedback.flashCount);
    }

    checkWin() {
        // Verificar se todos os discos estão na torre de destino (direita)
        if (this.towers[this.targetTower].disks.length !== this.disks.length) {
            return false;
        }

        // Verificar se os discos estão na ordem correta (maior embaixo, menor em cima)
        const disks = this.towers[this.targetTower].disks;
        for (let i = 0; i < disks.length - 1; i++) {
            if (this.disks[disks[i]].size <= this.disks[disks[i + 1]].size) {
                return false;
            }
        }

        return true;
    }

    handleWin() {
        clearInterval(this.timer);
        this.isGameActive = false;
        this.gameStarted = false;
        
        // Calcular eficiência
        const efficiency = Math.max(0, Math.min(100, (this.minMovesRequired / this.moveCount) * 100));
        
        // Criar mensagem de vitória personalizada
        let message = `Parabéns! Você completou a Torre de Hanói!\n\n`;
        message += `Total de movimentos: ${this.moveCount}\n`;
        message += `Movimentos mínimos necessários: ${this.minMovesRequired}\n`;
        message += `Sua eficiência: ${efficiency.toFixed(1)}%\n\n`;
        
        if (this.moveCount === this.minMovesRequired) {
            message += "Perfeito! Você encontrou a solução ótima!";
        } else if (efficiency >= 90) {
            message += "Excelente! Você encontrou uma solução muito eficiente!";
        } else if (efficiency >= 70) {
            message += "Bom trabalho! Você encontrou uma solução razoável.";
        } else {
            message += "Tente novamente para encontrar uma solução mais eficiente!";
        }

        // Mostrar mensagem de vitória
        const winDialog = document.createElement('div');
        winDialog.style.position = 'fixed';
        winDialog.style.top = '50%';
        winDialog.style.left = '50%';
        winDialog.style.transform = 'translate(-50%, -50%)';
        winDialog.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        winDialog.style.color = 'white';
        winDialog.style.padding = '20px';
        winDialog.style.borderRadius = '10px';
        winDialog.style.zIndex = '1000';
        winDialog.style.textAlign = 'center';
        winDialog.innerHTML = message.replace(/\n/g, '<br>');

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Fechar';
        closeButton.style.marginTop = '20px';
        closeButton.style.padding = '10px 20px';
        closeButton.style.backgroundColor = '#4CAF50';
        closeButton.style.border = 'none';
        closeButton.style.borderRadius = '5px';
        closeButton.style.color = 'white';
        closeButton.style.cursor = 'pointer';
        
        closeButton.onclick = () => {
            winDialog.remove();
            document.getElementById('startGame').disabled = false;
        };

        winDialog.appendChild(closeButton);
        document.body.appendChild(winDialog);

        // Tocar som de vitória
        this.playSoundEffect('win');

        // Parar música de fundo
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.isMusicPlaying = false;
        }

        // Adicionar efeitos de partículas para celebração
        this.createWinParticles();
    }

    showDiskInfo(disk) {
        // Criar ou atualizar tooltip
        let tooltip = document.getElementById('diskTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'diskTooltip';
            tooltip.style.position = 'fixed';
            tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '5px 10px';
            tooltip.style.borderRadius = '3px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '1000';
            document.body.appendChild(tooltip);
        }

        // Atualizar posição e conteúdo do tooltip
        const diskSize = this.getDiskSizeDescription(disk.size);
        tooltip.textContent = `Disco ${diskSize}`;
        
        // Posicionar tooltip próximo ao disco
        const vector = new THREE.Vector3();
        vector.setFromMatrixPosition(disk.mesh.matrixWorld);
        vector.project(this.camera);

        const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
        const y = (-(vector.y * 0.5) + 0.5) * this.renderer.domElement.clientHeight;

        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y - 10}px`;
        tooltip.style.opacity = '1';

        // Esconder tooltip após alguns segundos
        setTimeout(() => {
            tooltip.style.opacity = '0';
        }, 2000);
    }

    getDiskSizeDescription(size) {
        const sizes = [
            "Muito Pequeno",
            "Pequeno",
            "Médio-Pequeno",
            "Médio",
            "Médio-Grande",
            "Grande",
            "Muito Grande",
            "Enorme"
        ];
        return sizes[size];
    }

    showTowerInfo(tower, selectedDisk) {
        // Criar ou atualizar tooltip da torre
        let tooltip = document.getElementById(`towerTooltip${this.towers.indexOf(tower)}`);
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = `towerTooltip${this.towers.indexOf(tower)}`;
            tooltip.style.position = 'fixed';
            tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '5px 10px';
            tooltip.style.borderRadius = '3px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '1000';
            document.body.appendChild(tooltip);
        }

        // Atualizar conteúdo do tooltip
        if (tower.disks.length === 0) {
            tooltip.textContent = "Torre vazia - Movimento válido";
        } else {
            const topDiskIndex = tower.disks[0]; // Primeiro disco é o do topo
            const topDisk = this.disks[topDiskIndex];
            const canMove = selectedDisk.size < topDisk.size;
            tooltip.textContent = canMove 
                ? `Disco no topo: ${this.getDiskSizeDescription(topDisk.size)} - Movimento válido`
                : `Disco no topo: ${this.getDiskSizeDescription(topDisk.size)} - Movimento inválido (disco muito grande)`;
        }

        // Posicionar tooltip
        const vector = new THREE.Vector3();
        vector.setFromMatrixPosition(tower.mesh.matrixWorld);
        vector.project(this.camera);

        const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
        const y = (-(vector.y * 0.5) + 0.5) * this.renderer.domElement.clientHeight;

        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y - 10}px`;
        tooltip.style.opacity = '1';

        // Esconder tooltip após alguns segundos
        setTimeout(() => {
            tooltip.style.opacity = '0';
        }, 2000);
    }

    solveTower() {
        const n = parseInt(document.getElementById("discos").value);
        if (n < 1 || n > 10) {
            alert("Por favor, escolha um número de discos entre 1 e 10");
            return;
        }

        const resultado = [];
        this.torreHanoi(n, 'A', 'B', 'C', resultado);
        document.getElementById("movimentos").innerText = resultado.join("\n");

        // Atualizar o número mínimo de movimentos
        this.minMovesRequired = Math.pow(2, n) - 1;
        document.getElementById("minMoves").textContent = this.minMovesRequired;
    }

    torreHanoi(n, origem, auxiliar, destino, resultado) {
        if (n === 1) {
            resultado.push(`Mover disco 1 de ${origem} para ${destino}`);
            return;
        }

        this.torreHanoi(n - 1, origem, destino, auxiliar, resultado);
        resultado.push(`Mover disco ${n} de ${origem} para ${destino}`);
        this.torreHanoi(n - 1, auxiliar, origem, destino, resultado);
    }
}

// Inicializar o jogo quando a página carregar
window.addEventListener('load', () => {
    const game = new TowerOfHanoi();
    
    // Adicionar instruções iniciais
    const instructions = document.createElement('div');
    instructions.style.position = 'fixed';
    instructions.style.top = '10px';
    instructions.style.left = '50%';
    instructions.style.transform = 'translateX(-50%)';
    instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    instructions.style.color = 'white';
    instructions.style.padding = '10px 20px';
    instructions.style.borderRadius = '5px';
    instructions.style.zIndex = '1000';
    instructions.innerHTML = `
        <h4>Instruções:</h4>
        <p>1. Selecione um tempo</p>
        <p>2. Clique em "Iniciar Jogo"</p>
        <p>3. Clique em um disco para selecioná-lo</p>
        <p>4. Clique em uma torre para mover o disco</p>
        <p>5. Use o mouse para girar e zoom na visualização 3D</p>
        <p>6. Discos maiores devem ficar embaixo dos menores</p>
    `;
    document.body.appendChild(instructions);

    // Remover instruções após 10 segundos
    setTimeout(() => {
        instructions.style.opacity = '0';
        instructions.style.transition = 'opacity 1s';
        setTimeout(() => instructions.remove(), 1000);
    }, 10000);
}); 