/*Melissa Chang
11.20.15
Snake, instructions are as described in the game

Copyright free music:
OMFG - Hello by Hero Radio <https://www.youtube.com/watch?v=AaJ1pmYU7NI> 
Social media: https://soundcloud.com/alexomfg
              https://twitter.com/alexsavageomfg
import ddf.minim.*;
AudioPlayer player;
Minim minim;//audio context

*/

float[] x = new float[20];
float[] y = new float[20];
float segLength = 1; //length of Snake
float s = random (100, 1500);
float t = random (100, 860);
boolean gameMode = true;
boolean gameStart = false;
float j=0;

int score = 0;
int r = 1; //segLength
int squareSize = 10;
int foodk = 500; //x coordinate of food
int foodv = 80; //y coordinate of foood


void setup() {
  size(700, 700);
  strokeWeight(13);
  stroke(255, 100); 
  
  /*minim = new Minim(this);
  player = minim.loadFile("OMFG - Hello (Best Copyright Free Gaming Music).mp3", 2048);
  player.play();
  */
}

void draw() {
  if (gameMode == true){
      background(0);
      dragSegment(0, mouseX, mouseY);
      for(int i=0; i<x.length-1; i++) {
          dragSegment(i+1, x[i], y[i]);
            //everytime the Snake crashed into itself, the game ends:
          if(mouseX>=(x[i+1]-5) && mouseX<=(x[i+1]+5) && mouseY>=(y[i+1]-5)&& mouseY<=(y[i+1]+5) && r>7  ){
              /*r is equal to the snake's Length. If the snake is too short, it's easy for it to crash into its own body */
              gameMode = false;
              gameStart=false;
          }
      }
  
      fill(133, 33, 250, 267);
      rect(foodk, foodv, squareSize, squareSize);//snake's bait
      
      if ((mouseX >= (foodk)) && (mouseX <= (foodk+10)) && (mouseY >= (foodv)) && (mouseY <= (foodv+10))){ //when the mouse hoovers over the food, the food is eaten
        foodk = int(random(2, 68))*squareSize; //the coordinates of the food are changed to a random float within the canvas
        foodv = int(random(2, 68))*squareSize;      
        rect(foodk, foodv, squareSize, squareSize); //the food is translated to a new place
        score = score + 1; //1 point is added to the score
        r = r+3; //the snake's tail becomes longer
        } 
        
       if (((mouseX<=5) || (mouseY<=5) || (mouseX>=695) || (mouseY>=695)) && gameStart==true) { //if the mouse touches the edge of the game, and the game has already started
                  gameMode = false; //the game will end
                  gameStart=false;
        } 
  } //ALL OF THESE FUNCTIONS WILL GAME MODE IS TRUE, OR THE GAME IS GOING ON


if (j==0){ //once 'b' is pressed, this message will dissapear, as j==1, (this message is only meant to be seen once at the beginning of the game
  /*textSize(20);
  text("Don't run into the wall, and collect", 50, 200); //instructions
  text("as many purple squares as you can!", 50, 235);
  text("Be VERY careful not to run into your ", 50, 270);
  text("own body, the slightest move could", 50, 305);
  text("end the game!", 50, 340);
  textSize(35);
  text("Press 'b' to begin", 100, 380);
  textSize(20);
  */
  /*text("Press 'm' to mute music", 300, 600);
  
  text("Press 'p' to play music again later", 300, 624);*/
  
  }


 if (gameMode==false){ //if the game is not going on, the background will overlap the game and 'r' must be pressed to restart
   background(0);
   textSize(32);
   text("Press 'r' to restart", 100, 100); 
 }
  textSize(32); //the score is displayed the entire game
  text("Score: " +score, 500, 50); 
  
}

void keyPressed(){
    if (key == 'b' || key == 'r') { //keys pressed to begin or restart.
      gameStart = true;
      gameMode=true;
      j=1; //instructions dissapear first time 'b' is pressed
      r=1; //snake length reset to 1
      score=0; //score reset to 0
    }
    if (key == 'm'){
      player.pause();
    }
    if (key == 'p'){
    player.play();
    }
}

void dragSegment(int i, float xin, float yin) {
  float dx = xin - x[i];
  float dy = yin - y[i];
  float angle = atan2(dy, dx);  //determines the angle of how the shapes in the array are placed to create the snake like effect
  x[i] = xin - cos(angle) * segLength;
  y[i] = yin - sin(angle) * segLength;
  segment(x[i], y[i], angle);
  segLength = r;
}

void ellipse(float s, float t) { //creates the ellipses you see in the snake, at location s,t, with a diameter of 10
  pushMatrix();
  translate(s, t);
  ellipse(s, t, 10, 10);
  popMatrix(); 
}

void segment(float x, float y, float a) { //creates the segments connecting the ellipses
  pushMatrix();
  translate(x, y);
  rotate(a);
  line(0, 0, segLength, 0);
  popMatrix(); 
}