import React, { useEffect, useRef, useState } from 'react';

const SelfDrivingCar = () => {
  const canvasRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [generation, setGeneration] = useState(1);
  const [bestFitness, setBestFitness] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let road;
    let cars = [];
    let traffic = [];
    let bestCar;

    // Car class definition
    class Car {
      constructor(x, y, width, height, controlType, maxSpeed = 3, color = "blue") {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = 0;
        this.acceleration = 0.2;
        this.maxSpeed = maxSpeed;
        this.friction = 0.05;
        this.angle = 0;
        this.damaged = false;
        this.fitness = 0;
        this.polygon = [];
        this.color = color;

        this.useBrain = controlType === "AI";

        if (controlType !== "DUMMY") {
          this.sensor = new Sensor(this);
          this.brain = new NeuralNetwork(
            [this.sensor.rayCount, 10, 6, 4]  // Réseau plus complexe
          );
          
          // Variables pour le comportement de dépassement
          this.overtaking = false;
          this.targetLane = null;
          this.currentLane = Math.round((this.x - road.left) / (road.width / road.laneCount));
        }
        this.controls = new Controls(controlType);
      }

      update(roadBorders, traffic) {
        if (!this.damaged) {
          // Détection de la voie actuelle
          this.currentLane = Math.round((this.x - road.left) / (road.width / road.laneCount));
          
          // Mise à jour du mouvement
          this.move();
          this.fitness += this.speed;
          this.polygon = this.createPolygon();
          this.damaged = this.assessDamage(roadBorders, traffic);
          
          // Logique de dépassement avancée
          if (this.sensor) {
            this.sensor.update(roadBorders, traffic);
            const readings = this.sensor.readings;
            
            // Analyse des capteurs pour détecter les obstacles
            const frontSensors = [readings[Math.floor(readings.length/2)]];
            const leftSensors = readings.slice(0, Math.floor(readings.length/3));
            const rightSensors = readings.slice(2*Math.floor(readings.length/3));
            
            // Détection d'obstacles
            const obstacleAhead = frontSensors.some(s => s && s.offset < 0.5);
            const obstacleLeft = leftSensors.some(s => s && s.offset < 0.3);
            const obstacleRight = rightSensors.some(s => s && s.offset < 0.3);
            
            // Mise à jour du cerveau neuronal avec ces informations
            this.brain.obstacleAhead = obstacleAhead;
            this.brain.obstacleLeft = obstacleLeft;
            this.brain.obstacleRight = obstacleRight;
            
            // Décision de dépassement
            if (obstacleAhead && !this.overtaking) {
              // Commencer à dépasser
              if (!obstacleLeft && this.currentLane > 0) {
                // Dépasser par la gauche si possible
                this.targetLane = this.currentLane - 1;
                this.overtaking = true;
              } else if (!obstacleRight && this.currentLane < road.laneCount - 1) {
                // Sinon dépasser par la droite
                this.targetLane = this.currentLane + 1;
                this.overtaking = true;
              }
            }
            
            // Réaliser le dépassement
            if (this.overtaking && this.targetLane !== null) {
              const targetX = road.getLaneCenter(this.targetLane);
              
              // Orienter vers la voie cible
              if (Math.abs(this.x - targetX) < 10) {
                // Dépassement terminé
                this.overtaking = false;
                this.targetLane = null;
              } else if (this.x > targetX) {
                this.controls.left = true;
                this.controls.right = false;
              } else {
                this.controls.right = true;
                this.controls.left = false;
              }
              
              // Toujours avancer pendant le dépassement
              this.controls.forward = true;
            } else {
              // Comportement normal via le réseau neuronal
              const offsets = readings.map(s => s == null ? 0 : 1 - s.offset);
              const outputs = NeuralNetwork.feedForward(offsets, this.brain);
              
              if (this.useBrain) {
                this.controls.forward = outputs[0];
                this.controls.left = outputs[1];
                this.controls.right = outputs[2];
                this.controls.reverse = outputs[3];
              }
            }
          }
        }
      }

      assessDamage(roadBorders, traffic) {
        for (let i = 0; i < roadBorders.length; i++) {
          if (polysIntersect(this.polygon, roadBorders[i])) {
            return true;
          }
        }
        for (let i = 0; i < traffic.length; i++) {
          if (polysIntersect(this.polygon, traffic[i].polygon)) {
            return true;
          }
        }
        return false;
      }

      createPolygon() {
        const points = [];
        const rad = Math.hypot(this.width, this.height) / 2;
        const alpha = Math.atan2(this.width, this.height);
        points.push({
          x: this.x - Math.sin(this.angle - alpha) * rad,
          y: this.y - Math.cos(this.angle - alpha) * rad
        });
        points.push({
          x: this.x - Math.sin(this.angle + alpha) * rad,
          y: this.y - Math.cos(this.angle + alpha) * rad
        });
        points.push({
          x: this.x - Math.sin(Math.PI + this.angle - alpha) * rad,
          y: this.y - Math.cos(Math.PI + this.angle - alpha) * rad
        });
        points.push({
          x: this.x - Math.sin(Math.PI + this.angle + alpha) * rad,
          y: this.y - Math.cos(Math.PI + this.angle + alpha) * rad
        });
        return points;
      }

      move() {
        if (this.controls.forward) {
          this.speed += this.acceleration;
        }
        if (this.controls.reverse) {
          this.speed -= this.acceleration;
        }

        if (this.speed > this.maxSpeed) {
          this.speed = this.maxSpeed;
        }
        if (this.speed < -this.maxSpeed / 2) {
          this.speed = -this.maxSpeed / 2;
        }

        if (this.speed > 0) {
          this.speed -= this.friction;
        }
        if (this.speed < 0) {
          this.speed += this.friction;
        }
        if (Math.abs(this.speed) < this.friction) {
          this.speed = 0;
        }

        if (this.speed !== 0) {
          const flip = this.speed > 0 ? 1 : -1;
          if (this.controls.left) {
            this.angle += 0.03 * flip;
          }
          if (this.controls.right) {
            this.angle -= 0.03 * flip;
          }
        }

        this.x -= Math.sin(this.angle) * this.speed;
        this.y -= Math.cos(this.angle) * this.speed;
      }

      draw(ctx, drawSensor = false) {
        if (this.damaged) {
          ctx.fillStyle = "gray";
        } else if (this.overtaking) {
          // Couleur spéciale pendant le dépassement
          ctx.fillStyle = "#00BFFF"; // Bleu ciel pour indiquer un dépassement
        } else {
          ctx.fillStyle = this.color;
        }
        ctx.beginPath();
        ctx.moveTo(this.polygon[0].x, this.polygon[0].y);
        for (let i = 1; i < this.polygon.length; i++) {
          ctx.lineTo(this.polygon[i].x, this.polygon[i].y);
        }
        ctx.fill();

        if (this.sensor && drawSensor) {
          this.sensor.draw(ctx);
        }
        
        // Afficher l'état de dépassement
        if (this.overtaking) {
          ctx.font = "12px Arial";
          ctx.fillStyle = "white";
          ctx.fillText("Dépassement", this.x - 30, this.y - 30);
        }
      }
    }

    // Sensor class for detecting obstacles
    class Sensor {
      constructor(car) {
        this.car = car;
        this.rayCount = 9;         // Augmenté pour une meilleure détection latérale
        this.rayLength = 200;      // Augmenté pour voir plus loin
        this.raySpread = Math.PI / 1.5;  // Élargi pour mieux détecter sur les côtés

        this.rays = [];
        this.readings = [];
      }

      update(roadBorders, traffic) {
        this.castRays();
        this.readings = [];
        for (let i = 0; i < this.rays.length; i++) {
          this.readings.push(
            this.getReading(
              this.rays[i],
              roadBorders,
              traffic
            )
          );
        }
      }

      getReading(ray, roadBorders, traffic) {
        let touches = [];

        for (let i = 0; i < roadBorders.length; i++) {
          const touch = getIntersection(
            ray[0],
            ray[1],
            roadBorders[i][0],
            roadBorders[i][1]
          );
          if (touch) {
            touches.push(touch);
          }
        }

        for (let i = 0; i < traffic.length; i++) {
          const poly = traffic[i].polygon;
          for (let j = 0; j < poly.length; j++) {
            const value = getIntersection(
              ray[0],
              ray[1],
              poly[j],
              poly[(j + 1) % poly.length]
            );
            if (value) {
              touches.push(value);
            }
          }
        }

        if (touches.length === 0) {
          return null;
        } else {
          const offsets = touches.map(e => e.offset);
          const minOffset = Math.min(...offsets);
          return touches.find(e => e.offset === minOffset);
        }
      }

      castRays() {
        this.rays = [];
        for (let i = 0; i < this.rayCount; i++) {
          const rayAngle = lerp(
            this.raySpread / 2,
            -this.raySpread / 2,
            this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1)
          ) + this.car.angle;

          const start = { x: this.car.x, y: this.car.y };
          const end = {
            x: this.car.x - Math.sin(rayAngle) * this.rayLength,
            y: this.car.y - Math.cos(rayAngle) * this.rayLength
          };
          this.rays.push([start, end]);
        }
      }

      draw(ctx) {
        for (let i = 0; i < this.rayCount; i++) {
          let end = this.rays[i][1];
          if (this.readings[i]) {
            end = this.readings[i];
          }

          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "yellow";
          ctx.moveTo(
            this.rays[i][0].x,
            this.rays[i][0].y
          );
          ctx.lineTo(
            end.x,
            end.y
          );
          ctx.stroke();

          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "black";
          ctx.moveTo(
            this.rays[i][1].x,
            this.rays[i][1].y
          );
          ctx.lineTo(
            end.x,
            end.y
          );
          ctx.stroke();
        }
      }
    }

    // Controls for the car
    class Controls {
      constructor(type) {
        this.forward = false;
        this.left = false;
        this.right = false;
        this.reverse = false;

        switch (type) {
          case "KEYS":
            this.addKeyboardListeners();
            break;
          case "DUMMY":
            this.forward = true;
            break;
        }
      }

      addKeyboardListeners() {
        document.onkeydown = (event) => {
          switch (event.key) {
            case "ArrowLeft":
              this.left = true;
              break;
            case "ArrowRight":
              this.right = true;
              break;
            case "ArrowUp":
              this.forward = true;
              break;
            case "ArrowDown":
              this.reverse = true;
              break;
          }
        };
        document.onkeyup = (event) => {
          switch (event.key) {
            case "ArrowLeft":
              this.left = false;
              break;
            case "ArrowRight":
              this.right = false;
              break;
            case "ArrowUp":
              this.forward = false;
              break;
            case "ArrowDown":
              this.reverse = false;
              break;
          }
        };
      }
    }

    // Road class for defining the environment
    class Road {
      constructor(x, width, laneCount = 3) {
        this.x = x;
        this.width = width;
        this.laneCount = laneCount;

        this.left = x - width / 2;
        this.right = x + width / 2;

        const infinity = 1000000;
        this.top = -infinity;
        this.bottom = infinity;

        const topLeft = { x: this.left, y: this.top };
        const topRight = { x: this.right, y: this.top };
        const bottomLeft = { x: this.left, y: this.bottom };
        const bottomRight = { x: this.right, y: this.bottom };
        this.borders = [
          [topLeft, bottomLeft],
          [topRight, bottomRight]
        ];
      }

      getLaneCenter(laneIndex) {
        const laneWidth = this.width / this.laneCount;
        return this.left + laneWidth / 2 +
          Math.min(laneIndex, this.laneCount - 1) * laneWidth;
      }

      draw(ctx) {
        // Dessiner la surface de la route
        ctx.fillStyle = "#303030"; // Couleur foncée pour la route
        ctx.fillRect(this.left, this.top, this.width, this.bottom - this.top);
        
        // Ajouter des bordures très visibles
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#FFFF00"; // Jaune vif pour les bordures
        
        // Lignes de voie
        for (let i = 1; i <= this.laneCount - 1; i++) {
          const x = lerp(
            this.left,
            this.right,
            i / this.laneCount
          );

          ctx.setLineDash([20, 20]);
          ctx.beginPath();
          ctx.moveTo(x, this.top);
          ctx.lineTo(x, this.bottom);
          ctx.stroke();
        }

        // Bordures de route
        ctx.setLineDash([]);
        ctx.strokeStyle = "#FF0000"; // Rouge vif pour les bordures latérales
        ctx.lineWidth = 10;
        this.borders.forEach(border => {
          ctx.beginPath();
          ctx.moveTo(border[0].x, border[0].y);
          ctx.lineTo(border[1].x, border[1].y);
          ctx.stroke();
        });
      }
    }

    // Neural network for decision making
    class NeuralNetwork {
      constructor(neuronCounts) {
        this.levels = [];
        for (let i = 0; i < neuronCounts.length - 1; i++) {
          this.levels.push(new Level(
            neuronCounts[i], neuronCounts[i + 1]
          ));
        }
        
        // On garde une trace des obstacles détectés pour la prise de décision
        this.obstacleAhead = false;
        this.obstacleLeft = false;
        this.obstacleRight = false;
      }

      static feedForward(givenInputs, network) {
        let outputs = Level.feedForward(
          givenInputs, network.levels[0]);
        for (let i = 1; i < network.levels.length; i++) {
          outputs = Level.feedForward(
            outputs, network.levels[i]);
        }
        return outputs;
      }

      static mutate(network, amount = 1) {
        network.levels.forEach(level => {
          for (let i = 0; i < level.biases.length; i++) {
            level.biases[i] = lerp(
              level.biases[i],
              Math.random() * 2 - 1,
              amount
            );
          }
          for (let i = 0; i < level.weights.length; i++) {
            for (let j = 0; j < level.weights[i].length; j++) {
              level.weights[i][j] = lerp(
                level.weights[i][j],
                Math.random() * 2 - 1,
                amount
              );
            }
          }
        });
      }
    }

    class Level {
      constructor(inputCount, outputCount) {
        this.inputs = new Array(inputCount);
        this.outputs = new Array(outputCount);
        this.biases = new Array(outputCount);

        this.weights = [];
        for (let i = 0; i < inputCount; i++) {
          this.weights[i] = new Array(outputCount);
        }

        Level.randomize(this);
      }

      static randomize(level) {
        for (let i = 0; i < level.inputs.length; i++) {
          for (let j = 0; j < level.outputs.length; j++) {
            level.weights[i][j] = Math.random() * 2 - 1;
          }
        }

        for (let i = 0; i < level.biases.length; i++) {
          level.biases[i] = Math.random() * 2 - 1;
        }
      }

      static feedForward(givenInputs, level) {
        for (let i = 0; i < level.inputs.length; i++) {
          level.inputs[i] = givenInputs[i];
        }

        for (let i = 0; i < level.outputs.length; i++) {
          let sum = 0;
          for (let j = 0; j < level.inputs.length; j++) {
            sum += level.inputs[j] * level.weights[j][i];
          }

          if (sum > level.biases[i]) {
            level.outputs[i] = 1;
          } else {
            level.outputs[i] = 0;
          }
        }

        return [...level.outputs];
      }
    }

    // Utility functions
    function lerp(A, B, t) {
      return A + (B - A) * t;
    }

    function getIntersection(A, B, C, D) {
      const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
      const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
      const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);

      if (bottom !== 0) {
        const t = tTop / bottom;
        const u = uTop / bottom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          return {
            x: lerp(A.x, B.x, t),
            y: lerp(A.y, B.y, t),
            offset: t
          };
        }
      }

      return null;
    }

    function polysIntersect(poly1, poly2) {
      for (let i = 0; i < poly1.length; i++) {
        for (let j = 0; j < poly2.length; j++) {
          const touch = getIntersection(
            poly1[i],
            poly1[(i + 1) % poly1.length],
            poly2[j],
            poly2[(j + 1) % poly2.length]
          );
          if (touch) {
            return true;
          }
        }
      }
      return false;
    }

    // Initialize the simulation
    const initSimulation = () => {
      road = new Road(canvas.width / 2, canvas.width * 0.9);
      
      // Create AI cars
      cars = [];
      for (let i = 0; i < 100; i++) {
        cars.push(new Car(road.getLaneCenter(1), 100, 30, 50, "AI"));
      }
      
      // Set best car
      bestCar = cars[0];
      
      // Create traffic with varying speeds to encourage overtaking
      traffic = [
        new Car(road.getLaneCenter(1), -100, 30, 50, "DUMMY", 1.5, "red"),
        new Car(road.getLaneCenter(0), -300, 30, 50, "DUMMY", 1.0, "red"),
        new Car(road.getLaneCenter(2), -300, 30, 50, "DUMMY", 1.2, "red"),
        new Car(road.getLaneCenter(0), -500, 30, 50, "DUMMY", 0.8, "red"),
        new Car(road.getLaneCenter(1), -500, 30, 50, "DUMMY", 1.3, "red"),
        new Car(road.getLaneCenter(1), -700, 30, 50, "DUMMY", 1.0, "red"),
        new Car(road.getLaneCenter(2), -700, 30, 50, "DUMMY", 0.9, "red"),
        // Plus de voitures pour rendre les dépassements plus intéressants
        new Car(road.getLaneCenter(0), -900, 30, 50, "DUMMY", 1.1, "red"),
        new Car(road.getLaneCenter(1), -1100, 30, 50, "DUMMY", 0.7, "red"),
        new Car(road.getLaneCenter(2), -1300, 30, 50, "DUMMY", 1.4, "red"),
      ];
    };

    // Save the best car's brain
    const saveBestCar = () => {
      localStorage.setItem("bestBrain", JSON.stringify(bestCar.brain));
    };

    // Discard the current best car
    const discardBrain = () => {
      localStorage.removeItem("bestBrain");
    };

    // Initialize the cars with mutations of the best brain
    const initCars = () => {
      cars = [];
      for (let i = 0; i < 100; i++) {
        cars.push(new Car(road.getLaneCenter(1), 100, 30, 50, "AI"));
      }

      const bestBrain = JSON.parse(localStorage.getItem("bestBrain"));
      
      if (bestBrain) {
        for (let i = 0; i < cars.length; i++) {
          cars[i].brain = JSON.parse(JSON.stringify(bestBrain));
          
          if (i > 0) {
            NeuralNetwork.mutate(cars[i].brain, 0.2);
          }
        }
      }
      
      bestCar = cars[0];
    };

    // Animation loop
    const animate = (time) => {
      // Update traffic
      for (let i = 0; i < traffic.length; i++) {
        traffic[i].update(road.borders, []);
      }
      
      // Update cars
      for (let i = 0; i < cars.length; i++) {
        cars[i].update(road.borders, traffic);
      }

      // Find the best car (furthest y position)
      bestCar = cars.find(c => 
        c.y === Math.min(...cars.map(c => c.y))
      );
      
      // Update best fitness for display
      if (bestCar) {
        setBestFitness(Math.floor(Math.abs(bestCar.y)));
      }
      
      // Resize canvas to fill window
      canvas.height = window.innerHeight;
      canvas.width = 400;
      
      // Effacer le canvas avec une couleur de fond contrastée
      ctx.fillStyle = "#87CEEB"; // Couleur ciel bleu pour le fond
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw the scene
      ctx.save();
      ctx.translate(0, -bestCar.y + canvas.height * 0.7);
      
      road.draw(ctx);
      
      // Draw all cars
      for (let i = 0; i < traffic.length; i++) {
        traffic[i].draw(ctx);
      }
      
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < cars.length; i++) {
        cars[i].draw(ctx);
      }
      ctx.globalAlpha = 1;
      bestCar.draw(ctx, true);
      
      ctx.restore();
      
      // Request next frame if still running
      if (running) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    // Initialize simulation
    initSimulation();
    
    // Start simulation
    const startSimulation = () => {
      setRunning(true);
      animationFrameId = requestAnimationFrame(animate);
    };
    
    // Stop simulation
    const stopSimulation = () => {
      setRunning(false);
      cancelAnimationFrame(animationFrameId);
    };
    
    // Start or stop simulation based on running state
    if (running) {
      startSimulation();
    } else {
      stopSimulation();
    }
    
    // Generate a new generation of cars
    window.generateCars = () => {
      setGeneration(prev => prev + 1);
      saveBestCar();
      initCars();
    };

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [running]);

  // Toggle simulation running state
  const toggleSimulation = () => {
    setRunning(!running);
  };

  // Generate a new generation of cars
  const generateCars = () => {
    window.generateCars();
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="text-2xl font-bold mb-4">Self-Driving Car Simulation</div>
      
      <div className="mb-4 text-lg">
        <div>Generation: {generation}</div>
        <div>Best Distance: {bestFitness}</div>
      </div>
      
      <div className="flex space-x-4 mb-4">
        <button 
          onClick={toggleSimulation}
          className={`px-4 py-2 rounded font-bold ${running ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
        >
          {running ? 'Stop' : 'Start'}
        </button>
        
        <button 
          onClick={generateCars}
          className="px-4 py-2 bg-blue-500 text-white rounded font-bold"
          disabled={!running}
        >
          Next Generation
        </button>
      </div>
      
      <canvas 
        ref={canvasRef} 
        className="bg-gray-800 border-4 border-gray-900"
        width={400}
        height={600}
        style={{boxShadow: '0 0 10px rgba(0,0,0,0.5)'}}
      />
      
      <div className="mt-4 p-4 bg-gray-100 rounded max-w-md">
        <p className="mb-2">
          <strong>Comment ça marche :</strong> La simulation utilise un réseau neuronal pour contrôler chaque voiture.
          Le "cerveau" de la meilleure voiture est sauvegardé et utilisé pour créer la génération suivante avec de petites mutations.
        </p>
        <p className="mb-2">
          <strong>Nouvelle fonctionnalité de dépassement :</strong> Les voitures peuvent maintenant détecter les obstacles et
          changer de voie pour dépasser les véhicules plus lents. Une voiture qui dépasse change de couleur (bleu clair).
        </p>
        <p>
          <strong>Instructions :</strong> Appuyez sur Start pour commencer. Les lignes jaunes sont les capteurs.
          Cliquez sur "Next Generation" pour faire évoluer de meilleurs conducteurs au fil du temps.
        </p>
      </div>
    </div>
  );
};

export default SelfDrivingCar;