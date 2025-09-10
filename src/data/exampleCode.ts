export const EXAMPLE_ASM_CODE = `LDR R0, =0x30004
LDR R1, [R0]
LDR R0, =0x30008  
LDR R2, [R0]

LDR R0, =0x30010
MOV R5, #0
MOV R6, #0

find_player_loop:
    MUL R7, R5, R1
    ADD R7, R7, R6
    ADD R7, R0, R7
    LDRB R8, [R7]
    CMP R8, #4
    BEQ found_player
    
    ADD R6, R6, #1
    CMP R6, R1
    BLT find_player_loop
    MOV R6, #0
    ADD R5, R5, #1
    CMP R5, R2
    BLT find_player_loop
    
    MOV R11, #1
    B store_direction

found_player:
    LDR R3, =0x30200
    LDRB R3, [R3]
    
    MOV R7, #100
    MOV R8, #100
    MOV R9, #100
    MOV R10, #100
    
    CMP R3, #2
    SUBEQ R7, R7, #80
    CMP R3, #1  
    SUBEQ R8, R8, #80
    CMP R3, #4
    SUBEQ R9, R9, #80
    CMP R3, #3
    SUBEQ R10, R10, #80
    
    CMP R3, #1
    ADDEQ R7, R7, #12
    CMP R3, #2
    ADDEQ R8, R8, #12
    CMP R3, #3
    ADDEQ R9, R9, #12
    CMP R3, #4
    ADDEQ R10, R10, #12

find_nearest_collectible:
    // bestDist = width + height + 100
    MOV R11, R1
    ADD R11, R11, R2
    ADD R11, R11, #100
    LDR R0, =0x30204
    STR R11, [R0]
    // vertFlag = 0, horizFlag = 0
    MOV R11, #0
    LDR R0, =0x30208
    STR R11, [R0]
    LDR R0, =0x3020C
    STR R11, [R0]
    // row = 0
    MOV R4, #0
collect_row_loop:
    CMP R4, R2
    BGE end_collectible_scan
    // col = 0
    MOV R11, #0
collect_col_loop:
    CMP R11, R1
    BGE next_collect_row
    // tile = *(0x30010 + (row*width + col))
    LDR R0, =0x30010
    MUL R12, R4, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R0, [R12]
    // consider if dot (2) or energizer (3)
    CMP R0, #2
    BEQ consider_collect_tile
    CMP R0, #3
    BNE skip_collect_tile
consider_collect_tile:
    // dist = |row - R5| + |col - R6|
    // vertical component
    CMP R4, R5
    SUBLT R12, R5, R4
    SUBGE R12, R4, R5
    // horizontal component in R0
    CMP R11, R6
    SUBLT R0, R6, R11
    SUBGE R0, R11, R6
    ADD R12, R12, R0
    // if (dist < bestDist) update bestDist and flags
    LDR R0, =0x30204
    LDR R3, [R0]
    CMP R12, R3
    BGE skip_collect_tile
    // bestDist = dist
    STR R12, [R0]
    // vertFlag: 1=up, 2=down, 0=same
    MOV R3, #0
    CMP R4, R5
    MOVLT R3, #1
    MOVGT R3, #2
    LDR R0, =0x30208
    STR R3, [R0]
    // horizFlag: 1=left, 2=right, 0=same
    MOV R3, #0
    CMP R11, R6
    MOVLT R3, #1
    MOVGT R3, #2
    LDR R0, =0x3020C
    STR R3, [R0]
skip_collect_tile:
    ADD R11, R11, #1
    B collect_col_loop
next_collect_row:
    ADD R4, R4, #1
    B collect_row_loop
end_collectible_scan:
    // apply distance-based bonus to direction weights
    LDR R0, =0x30204
    LDR R3, [R0]        // bestDist
    // if bestDist > (width+height+50) => no target found
    MOV R12, R1
    ADD R12, R12, R2
    ADD R12, R12, #50
    CMP R3, R12
    BGT after_collectible_bonus
    // choose bonus based on distance tiers
    MOV R12, #40
    CMP R3, #6
    BLE set_collect_bonus_80
    B apply_collect_bonus
set_collect_bonus_80:
    MOV R12, #80
    CMP R3, #3
    BLE set_collect_bonus_120
    B apply_collect_bonus
set_collect_bonus_120:
    MOV R12, #120
    CMP R3, #1
    BLE set_collect_bonus_160
    B apply_collect_bonus
set_collect_bonus_160:
    MOV R12, #160
apply_collect_bonus:
    // vertical flag
    LDR R0, =0x30208
    LDR R11, [R0]
    CMP R11, #1
    ADDEQ R7, R7, R12    // up
    CMP R11, #2
    ADDEQ R8, R8, R12    // down
    // horizontal flag
    LDR R0, =0x3020C
    LDR R11, [R0]
    CMP R11, #1
    ADDEQ R9, R9, R12    // left
    CMP R11, #2
    ADDEQ R10, R10, R12  // right
after_collectible_bonus:
    // Find nearest ghost for repulsion
find_nearest_ghost:
    // bestDist = width + height + 100
    MOV R11, R1
    ADD R11, R11, R2
    ADD R11, R11, #100
    LDR R0, =0x30204
    STR R11, [R0]
    // vertFlag = 0, horizFlag = 0
    MOV R11, #0
    LDR R0, =0x30208
    STR R11, [R0]
    LDR R0, =0x3020C
    STR R11, [R0]
    // row = 0
    MOV R4, #0
ghost_row_loop:
    CMP R4, R2
    BGE end_ghost_scan
    // col = 0
    MOV R11, #0
ghost_col_loop:
    CMP R11, R1
    BGE next_ghost_row
    // tile = *(0x30010 + (row*width + col))
    LDR R0, =0x30010
    MUL R12, R4, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R0, [R12]
    // consider if ghost (5)
    CMP R0, #5
    BNE skip_ghost_tile
    // dist = |row - R5| + |col - R6|
    CMP R4, R5
    SUBLT R12, R5, R4
    SUBGE R12, R4, R5
    CMP R11, R6
    SUBLT R0, R6, R11
    SUBGE R0, R11, R6
    ADD R12, R12, R0
    // if (dist < bestDist) update bestDist and flags
    LDR R0, =0x30204
    LDR R3, [R0]
    CMP R12, R3
    BGE skip_ghost_tile
    STR R12, [R0]
    // vertFlag: 1=up, 2=down, 0=same (toward ghost)
    MOV R3, #0
    CMP R4, R5
    MOVLT R3, #1
    MOVGT R3, #2
    LDR R0, =0x30208
    STR R3, [R0]
    // horizFlag: 1=left, 2=right, 0=same (toward ghost)
    MOV R3, #0
    CMP R11, R6
    MOVLT R3, #1
    MOVGT R3, #2
    LDR R0, =0x3020C
    STR R3, [R0]
skip_ghost_tile:
    ADD R11, R11, #1
    B ghost_col_loop
next_ghost_row:
    ADD R4, R4, #1
    B ghost_row_loop
end_ghost_scan:
    // apply distance-based penalty along direction towards nearest ghost
    LDR R0, =0x30204
    LDR R3, [R0]        // best ghost distance
    // if bestDist > (width+height+50) => no ghost found
    MOV R12, R1
    ADD R12, R12, R2
    ADD R12, R12, #50
    CMP R3, R12
    BGT after_ghost_penalty
    // choose penalty based on distance tiers
    MOV R12, #0
    CMP R3, #6
    BLE set_ghost_penalty_60
    B apply_ghost_penalty
set_ghost_penalty_60:
    MOV R12, #60
    CMP R3, #4
    BLE set_ghost_penalty_120
    B apply_ghost_penalty
set_ghost_penalty_120:
    MOV R12, #120
    CMP R3, #2
    BLE set_ghost_penalty_200
    B apply_ghost_penalty
set_ghost_penalty_200:
    MOV R12, #200
apply_ghost_penalty:
    // subtract along direction towards ghost
    LDR R0, =0x30208
    LDR R11, [R0]
    CMP R11, #1
    SUBEQ R7, R7, R12    // up towards ghost
    CMP R11, #2
    SUBEQ R8, R8, R12    // down towards ghost
    LDR R0, =0x3020C
    LDR R11, [R0]
    CMP R11, #1
    SUBEQ R9, R9, R12    // left towards ghost
    CMP R11, #2
    SUBEQ R10, R10, R12  // right towards ghost
after_ghost_penalty:
    // restore map base address (safety)
    LDR R0, =0x30010

eval_up:
    CMP R5, #0
    SUBEQ R7, R7, #300
    BEQ eval_down
    
    SUB R11, R5, #1
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R7, R7, #400
    CMP R11, #5
    SUBEQ R7, R7, #800
    CMP R11, #3
    ADDEQ R7, R7, #200
    CMP R11, #2
    ADDEQ R7, R7, #50
    CMP R11, #1
    ADDEQ R7, R7, #10
    
    SUB R3, R5, #1
    MOV R4, R6
    
    CMP R3, #0
    BLE check_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
check_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
check_target_left:
    CMP R4, #0
    BLE check_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
check_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE eval_down
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
    CMP R5, #5
    ADDLT R7, R7, #15
    
    SUB R11, R5, #2
    CMP R11, #0
    BLT eval_down
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #3
    ADDEQ R7, R7, #120
    CMP R11, #2
    ADDEQ R7, R7, #25
    CMP R11, #0
    ADDNE R7, R7, #8

eval_down:
    ADD R11, R5, #1
    CMP R11, R2
    SUBGE R8, R8, #300
    BGE eval_left
    
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R8, R8, #400
    CMP R11, #5
    SUBEQ R8, R8, #800
    CMP R11, #3
    ADDEQ R8, R8, #200
    CMP R11, #2
    ADDEQ R8, R8, #50
    CMP R11, #1
    ADDEQ R8, R8, #10
    
    ADD R3, R5, #1
    MOV R4, R6
    
    CMP R3, #0
    BLE check_down_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
check_down_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_down_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
check_down_target_left:
    CMP R4, #0
    BLE check_down_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
check_down_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE eval_left
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
    MOV R11, R2
    LSR R11, R11, #1
    CMP R5, R11
    ADDGT R8, R8, #15
    
    ADD R11, R5, #2
    CMP R11, R2
    BGE eval_left
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #3
    ADDEQ R8, R8, #120
    CMP R11, #2
    ADDEQ R8, R8, #25
    CMP R11, #0
    ADDNE R8, R8, #8

eval_left:
    CMP R6, #0
    SUBEQ R9, R9, #300
    BEQ eval_right
    
    SUB R11, R6, #1
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R9, R9, #400
    CMP R11, #5
    SUBEQ R9, R9, #800
    CMP R11, #3
    ADDEQ R9, R9, #200
    CMP R11, #2
    ADDEQ R9, R9, #50
    CMP R11, #1
    ADDEQ R9, R9, #10
    
    MOV R3, R5
    SUB R4, R6, #1
    
    CMP R3, #0
    BLE check_left_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
check_left_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_left_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
check_left_target_left:
    CMP R4, #0
    BLE check_left_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
check_left_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE eval_right
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
    CMP R6, #5
    ADDLT R9, R9, #15
    
    CMP R6, #1
    BLE eval_right
    SUB R11, R6, #2
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #3
    ADDEQ R9, R9, #120
    CMP R11, #2
    ADDEQ R9, R9, #25
    CMP R11, #0
    ADDNE R9, R9, #8

eval_right:
    ADD R11, R6, #1
    CMP R11, R1
    SUBGE R10, R10, #300
    BGE choose_best
    
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R10, R10, #400
    CMP R11, #5
    SUBEQ R10, R10, #800
    CMP R11, #3
    ADDEQ R10, R10, #200
    CMP R11, #2
    ADDEQ R10, R10, #50
    CMP R11, #1
    ADDEQ R10, R10, #10
    
    MOV R3, R5
    ADD R4, R6, #1
    
    CMP R3, #0
    BLE check_right_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
check_right_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_right_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
check_right_target_left:
    CMP R4, #0
    BLE check_right_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
check_right_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE choose_best
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
    MOV R11, R1
    LSR R11, R11, #1
    CMP R6, R11
    ADDGT R10, R10, #15
    
    ADD R11, R6, #2
    CMP R11, R1
    BGE choose_best
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #3
    ADDEQ R10, R10, #120
    CMP R11, #2
    ADDEQ R10, R10, #25
    CMP R11, #0
    ADDNE R10, R10, #8

choose_best:
    MOV R11, #1
    MOV R12, R7
    
    CMP R8, R12
    MOVGT R11, #2
    MOVGT R12, R8
    
    CMP R9, R12
    MOVGT R11, #3
    MOVGT R12, R9
    
    CMP R10, R12
    MOVGT R11, #4

store_direction:
    LDR R0, =0x30000
    STR R11, [R0]
    
    LDR R0, =0x30200
    STRB R11, [R0]`

