var SerialPort = require("serialport").SerialPort;

var MAX_SPEED = 800;

//Commands
var COMMAND_KEY = 33;
var COMMAND_TRANSFER_START = 35;
var COMMAND_TRANSFER_END = 36;
var COMMAND_EXECUTE = 37;

var CMD_DRIVE = 64;
var CMD_DRIVE_SPS = 65;
var CMD_ARM_EXTEND = 67;
var CMD_ARM_RETRACT = 68;

// var testData = '[{"y":[100,100,-100,-100],"x":[100,-100,-100,100]},{"y":[-500,-500,500,500],"x":[500,-500,-500,500]},{"y":[1000,-1000,-1000,1000],"x":[1000,1000,-1000,-1000]}]';
//
// var serialPort = new SerialPort("/dev/tty.linvor-DevB", {
//   baudRate: 9600
// });
// serialPort.on("open", function(){
//   var lineData = generateLineData(testData);
//   console.log("serial open", serialPort);
//   serialPort.on('data', function(data) {
//     console.log('data received',data);
//   });
//   serialPort.write(lineData, function(err, results) {
//     console.log('err', err);
//     console.log('results', results);
//   });
// });

function Plugin(messenger, options){
  this.messenger = messenger;
  this.options = options;
  return this;
}

var optionsSchema = {
  type: 'object',
  properties: {
    comPort: {
      type: 'string',
      required: true
    }
  }
};

var messageSchema = {
  type: 'object',
  properties: {
    lineData: {
      type: 'string',
      required: true
    }
  }
};

Plugin.prototype.onMessage = function(message){
  var data = message.message || message.payload;
  var linePos = 0;
  var writing = true;
  console.log(this.options.comPort, message.fromUuid);
  if(this.options.comPort && data.lineData){
    var serialPort = new SerialPort(this.options.comPort, {
      baudRate: 9600
    });
    var lineData = generateLineData(data.lineData);
    serialPort.on("open", function(err){
      console.log("serial open", serialPort, err);
      setTimeout(function(){
        writing = false;
      }, 5000);
      serialPort.on('data', function(data) {
        console.log('data received',data, writing, linePos, lineData.length);
        if(!writing && data[0] == 0x23){
          if(linePos < lineData.length){
            writing = true;
            console.log('starting write', linePos);
            serialPort.write(lineData[linePos], function(err, results) {
              console.log('serial write', linePos, results);
              serialPort.drain(function(){
                setTimeout(function(){
                  console.log('serial drain', linePos);
                  linePos++;
                  writing = false;
                }, 100);
              });
            });
          }else{
            console.log('closing port', serialPort);
            serialPort.close();
          }
        }
      });
    });
  }else{
    console.log("ERROR: no com port specified or missing payload data.");
  }

};

Plugin.prototype.destroy = function(){
  //clean up
  console.log('destroying.', this.options);
};

function generateLineData(lineJSON){
  var BUFFER_MAX = 1024;
  var lineArray = JSON.parse(lineJSON);
  var line;
  var cx = 0, cy = 0, dx, dy;
  var ix, iy, len = 0;
  var lines = [];
  var buffer = new Buffer(BUFFER_MAX);
  console.log('transfer start');
  len = writeCommand(buffer, len, COMMAND_TRANSFER_START);
  for(ix = 0; ix < lineArray.length; ix++){
    line = lineArray[ix];
    if(line && line.x.length > 0 && line.x.length == line.y.length){
      dx = line.x[0];
      dy = -line.y[0];
      console.log('move to point @', dx, dy);
      len = writeDrive(buffer, len, cx, cy, dx, dy);
      cx = dx;
      cy = dy;
      console.log('arm down @', cx, cy);
      len = writeData(buffer, len, CMD_ARM_EXTEND);
      for(iy = 0; iy < line.x.length; iy++){
        dx = line.x[iy];
        dy = -line.y[iy];
        len = writeDrive(buffer, len, cx, cy, dx, dy);
        cx = dx;
        cy = dy;
        if(len > BUFFER_MAX - 64){
          console.log('transfer end');
          len = writeData(buffer, len, COMMAND_TRANSFER_END);
          console.log('execute');
          len = writeCommand(buffer, len, COMMAND_EXECUTE);
          lines.push(buffer.slice(0, len));
          buffer = new Buffer(1024);
          len = 0;
          console.log('transfer start');
          len = writeCommand(buffer, len, COMMAND_TRANSFER_START);
        }
      }
      console.log('arm up @', cx, cy);
      len = writeData(buffer, len, CMD_ARM_RETRACT);
    }
  }
  dx = 0;
  dy = 0;
  console.log('move home @', dy, dx);
  len = writeDrive(buffer, len, cx, cy, dx, dy);
  cx = dx;
  cy = dy;
  console.log('transfer end');
  len = writeData(buffer, len, COMMAND_TRANSFER_END);
  console.log('execute');
  len = writeCommand(buffer, len, COMMAND_EXECUTE);
  lines.push(buffer.slice(0, len));
  console.log("data", lines);
  return lines;
}

function writeDrive(buffer, len, cx, cy, dx, dy, draw){
  var sx = (cx-dx)+(cy-dy);
  var sy = (cx-dx)-(cy-dy);
  var td = Math.abs(sx) + Math.abs(sy);
  var spx, spy;
  if(Math.abs(sx) < 1 || Math.abs(sy) < 1){
    spx = MAX_SPEED;
    spy = MAX_SPEED;
  }else{
    spx = Math.round(Math.abs(sx)/td*MAX_SPEED);
    spy = Math.round(Math.abs(sy)/td*MAX_SPEED);
  }
  console.log('move by',sx,sy,'at',spx, spy,'sps');
  len = writeData2S(buffer, len, CMD_DRIVE_SPS, spx, spy);
  return writeData2S(buffer, len, CMD_DRIVE, sx, sy);
}

function writeCommand(buffer, len, command){
  buffer.writeInt8(COMMAND_KEY, len);
  len++;
  buffer.writeInt8(command, len);
  len++;
  buffer.writeUInt8(0, len);
  len++;
  buffer.writeUInt8(0, len);
  len++;
  buffer.writeUInt8(0, len);
  return len+1;
}

function writeData2S(buffer, len, command, data1, data2){
  buffer.writeInt8(command, len);
  len++;
  buffer.writeInt16BE(data1, len);
  len+=2;
  buffer.writeInt16BE(data2, len);
  return len+2;
}

function writeData1S(buffer, len, command, data){
  buffer.writeInt8(command, len);
  len++;
  buffer.writeInt16BE(data, len);
  len+=2;
  buffer.writeInt16BE(0, len);
  return len+2;
}

function writeData(buffer, len, command){
  buffer.writeInt8(command, len);
  len++;
  buffer.writeInt16BE(0, len);
  len+=2;
  buffer.writeInt16BE(0, len);
  return len+2;
}

module.exports = {
  Plugin: Plugin,
  optionsSchema: optionsSchema,
  messageSchema: messageSchema
};
